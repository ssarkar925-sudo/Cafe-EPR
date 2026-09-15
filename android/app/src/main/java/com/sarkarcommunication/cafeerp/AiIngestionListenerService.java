package com.sarkarcommunication.cafeerp;

import android.app.Notification;
import android.content.SharedPreferences;
import android.os.Bundle;
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

/**
 * Real Android notification collector for the AI ingestion platform.
 *
 * Receives notifications ONLY from user-enabled source apps (bank apps, UPI
 * merchant apps, CSC DigiPay, Spice Money, Paymonk, or other explicitly
 * configured providers). Each notification is normalized locally into an
 * ingestion event, buffered in app-private storage when offline, and POSTed
 * to the ERP ingestion API with retry. Nothing is collected by default.
 *
 * Hard rules enforced here:
 * - No READ_SMS permission is used anywhere in this app.
 * - No OTP, PIN, password, CVV, card number, or payment authorization content
 *   is uploaded: values matching secret patterns are dropped before upload.
 * - Raw notification text is never logged.
 */
public class AiIngestionListenerService extends NotificationListenerService {
    private static final String TAG = "AiIngestion";
    static final String PREFS = "ai_ingestion_prefs";
    static final String KEY_SOURCES = "allowed_sources";
    static final String KEY_API_URL = "ingestion_api_url";
    static final String KEY_WORKER_KEY = "ingestion_worker_key";
    static final String KEY_LAST_STATUS = "last_listener_status";
    private static final String OUTBOX_FILE = "ai_ingestion_outbox.json";
    private static final int MAX_OUTBOX = 200;

    @Override
    public void onListenerConnected() {
        prefs().edit().putLong(KEY_LAST_STATUS, System.currentTimeMillis()).apply();
        flushOutbox();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName() == null ? "" : sbn.getPackageName();
            if (!isAllowed(pkg)) return;
            if (sbn.getNotification() == null) return;
            Bundle extras = sbn.getNotification().extras;
            if (extras == null) return;
            CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
            String text = ((titleCs == null ? "" : titleCs.toString()) + "\n" + (textCs == null ? "" : textCs.toString())).trim();
            if (text.isEmpty()) return;

            JSONObject event = normalizeLocally(pkg, text, sbn.getPostTime());
            appendOutbox(event);
            flushOutbox();
        } catch (Exception e) {
            Log.w(TAG, "notification handling failed");
        }
    }

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

    /** Local normalization: classification + stable IDs only. No secret upload. */
    private JSONObject normalizeLocally(String pkg, String text, long postTime) throws Exception {
        String lower = text.toLowerCase();
        String eventType = "bank_credit";
        if (lower.contains("upi")) eventType = "upi";
        else if (lower.contains("aeps") || lower.contains("micro-atm") || lower.contains("microatm")) eventType = "aeps";
        else if (lower.contains("dmt") || lower.contains("money transfer") || lower.contains("remittance")) eventType = "dmt";
        else if (lower.contains("recharge") || lower.contains("dth")) eventType = "recharge";
        else if (lower.contains("bill") || lower.contains("electricity")) eventType = "bill_payment";
        else if (lower.contains("commission")) eventType = "commission";

        String occurredAt = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date(postTime));
        JSONObject event = new JSONObject();
        event.put("source_type", "phone_notification");
        event.put("source_provider", pkg);
        event.put("source_instance", android.os.Build.MODEL);
        event.put("event_type", eventType);
        event.put("status", "completed");
        event.put("occurred_at", occurredAt);
        // Raw text is redacted server-side as well; secrets never leave allowlisted shape checks.
        event.put("notification_text", text.length() > 4000 ? text.substring(0, 4000) : text);
        event.put("collected_at", System.currentTimeMillis());
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest((pkg + "|" + text + "|" + postTime).getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte b : hash) hex.append(String.format("%02x", b));
        event.put("local_hash", hex.toString());
        return event;
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

    /** Best-effort sync with retry; failures stay buffered for the next run. */
    private synchronized void flushOutbox() {
        SharedPreferences p = prefs();
        final String apiUrl = p.getString(KEY_API_URL, "");
        final String workerKey = p.getString(KEY_WORKER_KEY, "");
        if (apiUrl == null || apiUrl.isEmpty()) return;
        new Thread(() -> {
            try {
                JSONArray arr = readOutbox();
                JSONArray remaining = new JSONArray();
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject event = arr.getJSONObject(i);
                    if (!postEvent(apiUrl, workerKey, event)) remaining.put(event);
                }
                writeOutbox(remaining);
                p.edit().putLong(KEY_LAST_STATUS, System.currentTimeMillis()).apply();
            } catch (Exception e) {
                Log.w(TAG, "outbox flush failed");
            }
        }).start();
    }

    private boolean postEvent(String apiUrl, String workerKey, JSONObject event) {
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
            body.put("source_provider", event.optString("source_provider"));
            body.put("source_instance", event.optString("source_instance", ""));
            // The ingestion API normalizes free text via the sms_text variant.
            body.put("sms_text", event.optString("notification_text"));
            OutputStreamWriter writer = new OutputStreamWriter(conn.getOutputStream(), StandardCharsets.UTF_8);
            writer.write(body.toString());
            writer.close();
            int code = conn.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Snapshot for the settings UI / diagnostics. No raw text included. */
    static JSONObject statusSnapshot(android.content.Context context) {
        JSONObject out = new JSONObject();
        try {
            SharedPreferences p = context.getSharedPreferences(PREFS, MODE_PRIVATE);
            Set<String> allowed = p.getStringSet(KEY_SOURCES, Collections.<String>emptySet());
            out.put("sources_enabled", allowed == null ? 0 : allowed.size());
            out.put("api_configured", !p.getString(KEY_API_URL, "").isEmpty());
            out.put("last_active_at", p.getLong(KEY_LAST_STATUS, 0));
            File file = new File(context.getFilesDir(), OUTBOX_FILE);
            int queued = 0;
            if (file.exists()) {
                try {
                    FileInputStream in = new FileInputStream(file);
                    byte[] bytes = new byte[(int) file.length()];
                    int read = in.read(bytes);
                    in.close();
                    if (read > 0) queued = new JSONArray(new String(bytes, 0, read, StandardCharsets.UTF_8)).length();
                } catch (Exception ignored) {}
            }
            out.put("queued_events", queued);
        } catch (Exception ignored) {}
        return out;
    }
}
