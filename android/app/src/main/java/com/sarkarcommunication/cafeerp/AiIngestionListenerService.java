package com.sarkarcommunication.cafeerp;

import android.app.Notification;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkRequest;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Real Android notification collector for the AI ingestion platform.
 *
 * Pipeline per notification (all on-device, all explicit):
 *   RECEIVED -> NORMALIZED -> QUEUED -> SENT | FAILED | DUPLICATE
 * Rejected (non-transactional, secret-bearing, or low-confidence) items are
 * recorded locally as REJECTED and never uploaded as financial events.
 *
 * Receives notifications ONLY when the master switch is on AND the source app
 * is explicitly enabled by the owner. Nothing is collected by default.
 *
 * Hard rules enforced here:
 * - NotificationListenerService only. No AccessibilityService. No READ_SMS.
 * - No OTP, PIN, password, CVV, card number, banking login, session cookie,
 *   or payment-authorization content is uploaded or logged — ever.
 * - Raw notification text is never logged; outbox keeps only unsent items.
 * - No financial action is ever initiated from this device path.
 */
public class AiIngestionListenerService extends NotificationListenerService {
    private static final String TAG = "AiIngestion";
    static final String PREFS = "ai_ingestion_prefs";
    static final String KEY_ENABLED = "collection_enabled";
    static final String KEY_SOURCES = "allowed_sources";
    static final String KEY_API_URL = "ingestion_api_url";
    static final String KEY_WORKER_KEY = "ingestion_worker_key";
    static final String KEY_LAST_STATUS = "last_listener_status";
    static final String KEY_LAST_RESULT = "last_upload_result";
    static final String KEY_LAST_ERROR = "last_error_code";
    static final String KEY_RETRY_AT = "next_retry_at";
    static final String KEY_RETRY_COUNT = "consecutive_failures";
    static final String KEY_COUNTS = "event_counters";

    private static final String OUTBOX_FILE = "ai_ingestion_outbox.json";
    private static final int MAX_OUTBOX = 200;
    // Exponential backoff: 1m, 5m, 15m, 60m cap.
    private static final long[] BACKOFF_MS = {60_000L, 300_000L, 900_000L, 3_600_000L};

    private static final Pattern SECRET_TEXT =
            Pattern.compile("otp|one[- ]time pass|\\bpin\\b|password|passcode|cvv|payment authorization|authorize (payment|transaction)", Pattern.CASE_INSENSITIVE);
    private static final Pattern LONG_DIGITS = Pattern.compile("(?<!\\d)(?:\\d[ -]?){13,19}(?!\\d)");

    private final Handler handler = new Handler(Looper.getMainLooper());
    private ConnectivityManager.NetworkCallback networkCallback = null;

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    @Override
    public void onListenerConnected() {
        prefs().edit().putLong(KEY_LAST_STATUS, System.currentTimeMillis()).apply();
        registerNetworkRetry();
        flushOutbox();
    }

    @Override
    public void onListenerDisconnected() {
        unregisterNetworkRetry();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (!prefs().getBoolean(KEY_ENABLED, false)) return;
            String pkg = sbn.getPackageName() == null ? "" : sbn.getPackageName();
            if (!isAllowed(pkg)) return;
            if (sbn.getNotification() == null) return;
            Bundle extras = sbn.getNotification().extras;
            if (extras == null) return;
            CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
            String title = titleCs == null ? "" : titleCs.toString();
            String text = textCs == null ? "" : textCs.toString();
            if ((title + text).trim().isEmpty()) return;

            handleNotification(pkg, title, text, sbn.getPostTime());
        } catch (Exception e) {
            Log.w(TAG, "notification handling failed");
        }
    }

    // ------------------------------------------------------------------
    // RECEIVED -> NORMALIZED (parse, screen, gate)
    // ------------------------------------------------------------------

    private void handleNotification(String pkg, String title, String text, long postTime) throws Exception {
        String combined = (title + "\n" + text).trim();

        // 1. Secret pre-screen: OTP/PIN/password/CVV/card-number content is
        //    never uploaded and never logged. Record locally as rejected.
        if (SECRET_TEXT.matcher(combined).find() || LONG_DIGITS.matcher(combined).find()) {
            recordLocalRejection(pkg, "secret_content_rejected");
            bumpCounter("rejected");
            return;
        }

        // 2. Provider adapter parse.
        NotificationParsers.NotificationAdapter adapter = NotificationParsers.adapterFor(pkg);
        NotificationParsers.ParsedNotification parsed = adapter.parse(title, text);

        // 3. Confidence gate: below threshold => local rejected state only.
        if (parsed == null || parsed.confidence < NotificationParsers.CONFIDENCE_THRESHOLD || parsed.amount == null) {
            recordLocalRejection(pkg, "low_confidence_or_unparseable");
            bumpCounter("rejected");
            return;
        }

        // 4. Local idempotency: same content within 24h => DUPLICATE, no append.
        String localHash = sha256Hex(pkg + "|" + combined + "|" + (postTime / 60000));
        if (hasRecentHash(localHash)) {
            bumpCounter("duplicate");
            updateDiagnostics("duplicate", null);
            return;
        }

        JSONObject event = new JSONObject();
        event.put("local_id", UUID.randomUUID().toString());
        event.put("status", "QUEUED");
        event.put("attempts", 0);
        event.put("next_retry_at", 0L);
        event.put("created_at", System.currentTimeMillis());
        event.put("provider", pkg);
        event.put("adapter", adapter.providerId());
        event.put("event_type", parsed.eventType);
        event.put("amount", parsed.amount);
        event.put("direction", parsed.direction);
        event.put("reference", parsed.reference == null ? JSONObject.NULL : parsed.reference);
        event.put("occurred_at", parsed.occurredAt == null ? JSONObject.NULL : parsed.occurredAt);
        event.put("sender_or_beneficiary", parsed.senderOrBeneficiary == null ? JSONObject.NULL : parsed.senderOrBeneficiary);
        event.put("account_last4", parsed.accountLast4 == null ? JSONObject.NULL : parsed.accountLast4);
        event.put("available_balance", parsed.availableBalance == null ? JSONObject.NULL : parsed.availableBalance);
        event.put("bank_name", parsed.bankName == null ? JSONObject.NULL : parsed.bankName);
        event.put("confidence", parsed.confidence);
        event.put("local_hash", localHash);
        // Raw text retained ONLY until upload succeeds, then dropped. Never logged.
        event.put("notification_text", combined.length() > 4000 ? combined.substring(0, 4000) : combined);
        appendOutbox(event);
        bumpCounter("received");
        flushOutbox();
    }

    private void recordLocalRejection(String pkg, String reason) {
        try {
            SharedPreferences p = prefs();
            p.edit().putString("last_rejection", reason + "@" + System.currentTimeMillis()).apply();
        } catch (Exception ignored) {}
    }

    private boolean hasRecentHash(String hash) {
        try {
            JSONArray arr = readOutbox();
            long cutoff = System.currentTimeMillis() - 24L * 3600_000L;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject e = arr.optJSONObject(i);
                if (e == null) continue;
                if (hash.equals(e.optString("local_hash", "")) && e.optLong("created_at", 0) >= cutoff) return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    // ------------------------------------------------------------------
    // QUEUED -> SENT | FAILED | DUPLICATE (upload with backoff + retry)
    // ------------------------------------------------------------------

    private synchronized void flushOutbox() {
        SharedPreferences p = prefs();
        final String apiUrl = p.getString(KEY_API_URL, "");
        if (apiUrl == null || apiUrl.isEmpty()) return;
        if (System.currentTimeMillis() < p.getLong(KEY_RETRY_AT, 0)) return;
        new Thread(() -> {
            try {
                JSONArray arr = readOutbox();
                JSONArray remaining = new JSONArray();
                boolean hadFailure = false;
                long now = System.currentTimeMillis();
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject event = arr.optJSONObject(i);
                    if (event == null) continue;
                    if (!"QUEUED".equals(event.optString("status", "QUEUED"))) {
                        remaining.put(event);
                        continue;
                    }
                    if (event.optLong("next_retry_at", 0) > now) {
                        remaining.put(event);
                        continue;
                    }
                    UploadOutcome outcome = postEvent(apiUrl, p.getString(KEY_WORKER_KEY, ""), event);
                    if (outcome == UploadOutcome.SENT || outcome == UploadOutcome.DUPLICATE) {
                        bumpCounter(outcome == UploadOutcome.SENT ? "sent" : "duplicate");
                        updateDiagnostics(outcome == UploadOutcome.SENT ? "sent" : "duplicate", null);
                        // Dropped from outbox: server holds the canonical record now.
                    } else if (outcome == UploadOutcome.RETRYABLE) {
                        int attempts = event.optInt("attempts", 0) + 1;
                        event.put("attempts", attempts);
                        event.put("next_retry_at", now + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]);
                        event.put("status", "QUEUED");
                        remaining.put(event);
                        hadFailure = true;
                    } else {
                        event.put("status", "FAILED");
                        remaining.put(event);
                        bumpCounter("failed");
                        updateDiagnostics("failed", outcome == UploadOutcome.FORBIDDEN ? "auth" : "rejected");
                        hadFailure = true;
                    }
                }
                writeOutbox(remaining);
                SharedPreferences.Editor edit = p.edit().putLong(KEY_LAST_STATUS, System.currentTimeMillis());
                if (hadFailure) {
                    int failures = p.getInt(KEY_RETRY_COUNT, 0) + 1;
                    edit.putInt(KEY_RETRY_COUNT, failures);
                    edit.putLong(KEY_RETRY_AT, now + BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)]);
                } else {
                    edit.putInt(KEY_RETRY_COUNT, 0).putLong(KEY_RETRY_AT, 0);
                }
                edit.apply();
                if (hadFailure) scheduleRetry();
            } catch (Exception e) {
                Log.w(TAG, "outbox flush failed");
            }
        }).start();
    }

    private enum UploadOutcome { SENT, DUPLICATE, RETRYABLE, FAILED, FORBIDDEN }

    private UploadOutcome postEvent(String apiUrl, String workerKey, JSONObject event) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(apiUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(20000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            if (workerKey != null && !workerKey.isEmpty()) {
                conn.setRequestProperty("x-ingestion-worker-key", workerKey);
            }
            JSONObject body = new JSONObject();
            body.put("source_type", "phone_notification");
            body.put("source_provider", event.optString("provider"));
            body.put("source_instance", deviceInstanceId());
            body.put("sms_text", event.optString("notification_text"));
            OutputStreamWriter writer = new OutputStreamWriter(conn.getOutputStream(), StandardCharsets.UTF_8);
            writer.write(body.toString());
            writer.close();
            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                // Distinguish acceptance from server-side dedupe via body state.
                try {
                    java.io.InputStream in = conn.getInputStream();
                    StringBuilder sb = new StringBuilder();
                    byte[] buf = new byte[2048];
                    int n;
                    while ((n = in.read(buf)) > 0 && sb.length() < 2048) {
                        sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
                    }
                    in.close();
                    if (sb.toString().contains("\"duplicate\"")) return UploadOutcome.DUPLICATE;
                } catch (Exception ignored) {}
                return UploadOutcome.SENT;
            }
            if (code == 408 || code == 429 || (code >= 500 && code < 600)) return UploadOutcome.RETRYABLE;
            if (code == 401 || code == 403) return UploadOutcome.FORBIDDEN;
            return UploadOutcome.FAILED;
        } catch (Exception e) {
            return UploadOutcome.RETRYABLE;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void scheduleRetry() {
        try {
            handler.removeCallbacksAndMessages(null);
            long delay = Math.max(0, prefs().getLong(KEY_RETRY_AT, 0) - System.currentTimeMillis());
            handler.postDelayed(this::flushOutbox, Math.min(delay, 3_600_000L));
        } catch (Exception ignored) {}
    }

    private void registerNetworkRetry() {
        try {
            unregisterNetworkRetry();
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm == null) return;
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network network) {
                    try {
                        prefs().edit().putLong(KEY_RETRY_AT, 0).apply();
                    } catch (Exception ignored) {}
                    flushOutbox();
                }
            };
            cm.registerDefaultNetworkCallback(networkCallback);
        } catch (Exception ignored) {}
    }

    private void unregisterNetworkRetry() {
        try {
            if (networkCallback != null) {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
                if (cm != null) cm.unregisterNetworkCallback(networkCallback);
            }
        } catch (Exception ignored) {}
        networkCallback = null;
    }

    // ------------------------------------------------------------------
    // Storage, identity, diagnostics (no notification contents, ever)
    // ------------------------------------------------------------------

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private boolean isAllowed(String pkg) {
        Set<String> allowed = prefs().getStringSet(KEY_SOURCES, Collections.<String>emptySet());
        if (allowed == null) return false;
        for (String entry : allowed) {
            if (entry != null && entry.trim().equalsIgnoreCase(pkg)) return true;
        }
        return false;
    }

    /** Non-secret device identifier for diagnostics (Android ID, app-scoped). */
    private String deviceInstanceId() {
        try {
            String androidId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
            String model = android.os.Build.MODEL == null ? "android" : android.os.Build.MODEL;
            if (androidId == null || androidId.isEmpty()) return model;
            return model + " • " + androidId;
        } catch (Exception e) {
            return "android-device";
        }
    }

    private String sha256Hex(String input) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte b : hash) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    private synchronized void appendOutbox(JSONObject event) {
        try {
            JSONArray arr = readOutbox();
            arr.put(event);
            while (arr.length() > MAX_OUTBOX) arr.remove(0);
            writeOutbox(arr);
        } catch (Exception e) {
            Log.w(TAG, "outbox append failed");
        }
    }

    private JSONArray readOutbox() {
        File file = new File(getFilesDir(), OUTBOX_FILE);
        if (!file.exists()) return new JSONArray();
        try {
            FileInputStream in = new FileInputStream(file);
            byte[] bytes = new byte[(int) file.length()];
            int read = in.read(bytes);
            in.close();
            if (read <= 0) return new JSONArray();
            return new JSONArray(new String(bytes, 0, read, StandardCharsets.UTF_8));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private void writeOutbox(JSONArray arr) throws Exception {
        FileOutputStream out = openFileOutput(OUTBOX_FILE, MODE_PRIVATE);
        OutputStreamWriter writer = new OutputStreamWriter(out, StandardCharsets.UTF_8);
        writer.write(arr.toString());
        writer.close();
    }

    private void bumpCounter(String name) {
        try {
            SharedPreferences p = prefs();
            String raw = p.getString(KEY_COUNTS, "{}");
            JSONObject counters = new JSONObject(raw == null || raw.isEmpty() ? "{}" : raw);
            counters.put(name, counters.optInt(name, 0) + 1);
            p.edit().putString(KEY_COUNTS, counters.toString()).apply();
        } catch (Exception ignored) {}
    }

    private void updateDiagnostics(String result, String errorCode) {
        try {
            SharedPreferences.Editor edit = prefs().edit()
                    .putLong(KEY_LAST_STATUS, System.currentTimeMillis())
                    .putString(KEY_LAST_RESULT, result);
            if (errorCode != null) edit.putString(KEY_LAST_ERROR, errorCode);
            else edit.remove(KEY_LAST_ERROR);
            edit.apply();
        } catch (Exception ignored) {}
    }

    /** Snapshot for the settings UI / diagnostics. Counts and codes only. */
    static JSONObject statusSnapshot(android.content.Context context) {
        JSONObject out = new JSONObject();
        try {
            SharedPreferences p = context.getSharedPreferences(PREFS, MODE_PRIVATE);
            Set<String> allowed = p.getStringSet(KEY_SOURCES, Collections.<String>emptySet());
            out.put("collection_enabled", p.getBoolean(KEY_ENABLED, false));
            out.put("sources_enabled", allowed == null ? 0 : allowed.size());
            out.put("api_configured", !p.getString(KEY_API_URL, "").isEmpty());
            out.put("last_active_at", p.getLong(KEY_LAST_STATUS, 0));
            out.put("last_result", p.getString(KEY_LAST_RESULT, ""));
            out.put("last_error_code", p.getString(KEY_LAST_ERROR, ""));
            out.put("consecutive_failures", p.getInt(KEY_RETRY_COUNT, 0));
            try {
                out.put("counters", new JSONObject(p.getString(KEY_COUNTS, "{}")));
            } catch (Exception e) {
                out.put("counters", new JSONObject());
            }
            File file = new File(context.getFilesDir(), OUTBOX_FILE);
            int queued = 0;
            int failed = 0;
            if (file.exists()) {
                try {
                    FileInputStream in = new FileInputStream(file);
                    byte[] bytes = new byte[(int) file.length()];
                    int read = in.read(bytes);
                    in.close();
                    if (read > 0) {
                        JSONArray arr = new JSONArray(new String(bytes, 0, read, StandardCharsets.UTF_8));
                        for (int i = 0; i < arr.length(); i++) {
                            String status = arr.optJSONObject(i) == null ? "" : arr.optJSONObject(i).optString("status", "");
                            if ("FAILED".equals(status)) failed++;
                            else queued++;
                        }
                    }
                } catch (Exception ignored) {}
            }
            out.put("queued_events", queued);
            out.put("failed_events", failed);
        } catch (Exception ignored) {}
        return out;
    }
}
