package com.sarkarcommunication.cafeerp;

import android.accessibilityservice.AccessibilityService;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class AepsAccessibilityService extends AccessibilityService {
    private static AepsAccessibilityService instance;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean scanScheduled = false;
    private final Set<String> sentFingerprints = new HashSet<>();

    private static final Pattern TXN_ID = Pattern.compile("(?:transaction\\s*(?:id|no|number)|txn\\s*(?:id|no|number)|txn\\s*ref|transaction\\s*ref)\\s*[:#-]?\\s*([A-Za-z0-9-]{5,64})", Pattern.CASE_INSENSITIVE);
    private static final Pattern RRN = Pattern.compile("(?:rrn|retrieval\\s*reference(?:\\s*number)?)\\s*[:#-]?\\s*([0-9]{6,20})", Pattern.CASE_INSENSITIVE);
    private static final Pattern AMOUNT = Pattern.compile("(?:amount|txn\\s*amount|transaction\\s*amount|withdrawal\\s*amount|cash\\s*withdrawal)\\s*[:=-]?\\s*(?:₹|rs\\.?|inr)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern STATUS = Pattern.compile("(?:status|transaction\\s*status)\\s*[:=-]?\\s*([^\\n|]{2,40})", Pattern.CASE_INSENSITIVE);
    private static final Pattern TYPE = Pattern.compile("(?:transaction\\s*type|type|service)\\s*[:=-]?\\s*([^\\n|]{2,60})", Pattern.CASE_INSENSITIVE);
    private static final Pattern CUSTOMER = Pattern.compile("(?:customer\\s*name|customer)\\s*[:=-]?\\s*([A-Za-z][A-Za-z .'-]{2,80})", Pattern.CASE_INSENSITIVE);
    private static final Pattern MOBILE = Pattern.compile("(?:mobile|mobile\\s*(?:no|number)|phone)\\s*[:=-]?\\s*(?:\\+?91[- ]?)?([6-9]\\d{9})", Pattern.CASE_INSENSITIVE);
    private static final Pattern AADHAAR_LAST4 = Pattern.compile("(?:aadhaar|aadhar)\\s*(?:last\\s*4|xxxx|x{4,})?\\s*[:#-]?\\s*(?:x{4,}|\\*{4,})?\\s*(\\d{4})\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern BANK = Pattern.compile("(?:bank\\s*name|issuer\\s*bank|customer\\s*bank|bank)\\s*[:=-]?\\s*([A-Za-z][A-Za-z &.()'-]{2,100})", Pattern.CASE_INSENSITIVE);
    private static final Pattern FEE = Pattern.compile("(?:customer\\s*fee|service\\s*fee|fee|charge)\\s*[:=-]?\\s*(?:₹|rs\\.?|inr)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern COMMISSION = Pattern.compile("(?:commission|comm)\\s*[:=-]?\\s*(?:₹|rs\\.?|inr)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE);

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        requestScan(getApplicationContext());
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!AepsCollectorPlugin.enabled(this)) return;
        if (event.getPackageName() == null) return;
        if (!isConfiguredPackage(event.getPackageName().toString())) return;
        scheduleScan();
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    static void requestScan(android.content.Context context) {
        if (instance != null) instance.scheduleScan();
    }

    private void scheduleScan() {
        if (scanScheduled) return;
        scanScheduled = true;
        handler.postDelayed(() -> {
            scanScheduled = false;
            scanCurrentWindow();
        }, 1500);
    }

    private void scanCurrentWindow() {
        if (!AepsCollectorPlugin.enabled(this)) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null) return;
        String packageName = root.getPackageName().toString();
        JSONObject config = getPackageConfig(packageName);
        if (config == null) return;

        StringBuilder text = new StringBuilder();
        collectText(root, text);
        root.recycle();
        String screen = text.toString().replaceAll("\\s+", " ").trim();
        if (screen.isEmpty() || containsSensitiveMarker(screen)) return;

        JSONObject tx = extractTransaction(screen, packageName, config);
        if (tx == null) return;

        String fingerprint = tx.optString("portalCode") + "|" + tx.optString("externalTransactionId") + "|" +
                tx.optString("amount") + "|" + tx.optString("transactionType");
        if (sentFingerprints.contains(fingerprint)) return;
        sentFingerprints.add(fingerprint);
        if (sentFingerprints.size() > 500) sentFingerprints.remove(sentFingerprints.iterator().next());

        sendToServer(tx);
    }

    private void collectText(AccessibilityNodeInfo node, StringBuilder out) {
        if (node == null) return;
        CharSequence text = node.getText();
        if (text != null) out.append(text).append("\\n");
        CharSequence desc = node.getContentDescription();
        if (desc != null) out.append(desc).append("\\n");
        for (int i = 0; i < node.getChildCount(); i++) collectText(node.getChild(i), out);
    }

    private boolean containsSensitiveMarker(String text) {
        return Pattern.compile("(?:otp|one\\s*time\\s*password|mpin|password|passcode|biometric|fingerprint)", Pattern.CASE_INSENSITIVE).matcher(text).find();
    }

    private JSONObject extractTransaction(String text, String packageName, JSONObject config) {
        Matcher id = TXN_ID.matcher(text);
        Matcher amount = AMOUNT.matcher(text);
        if (!id.find() || !amount.find()) return null;

        double value = parseNumber(amount.group(1));
        if (value <= 0) return null;

        String portalCode = config.optString("portalCode", "unknown");
        String typeRaw = match(TYPE, text);
        String typeLower = (typeRaw == null ? text : typeRaw).toLowerCase();
        String type = typeLower.contains("collection") || typeLower.contains("aadhaar pay") || typeLower.contains("merchant pay")
                ? "payment_collection"
                : typeLower.contains("balance") || typeLower.contains("enquiry") || typeLower.contains("inquiry")
                ? "balance_enquiry"
                : typeLower.contains("mini statement") || typeLower.contains("statement")
                ? "mini_statement"
                : "cash_out";

        JSONObject tx = new JSONObject();
        try {
            tx.put("portalCode", portalCode);
            tx.put("portalName", displayName(portalCode));
            tx.put("packageName", packageName);
            tx.put("sourceId", config.optString("sourceId", ""));
            tx.put("externalTransactionId", id.group(1));
            String rrn = match(RRN, text);
            tx.put("rrn", rrn == null ? JSONObject.NULL : rrn);
            tx.put("externalReference", rrn == null ? JSONObject.NULL : rrn);
            tx.put("status", safeUpper(match(STATUS, text), text.contains("success") ? "SUCCESS" : "UNKNOWN"));
            tx.put("transactionType", type);
            tx.put("amount", value);
            tx.put("customerName", match(CUSTOMER, text));
            tx.put("customerMobile", match(MOBILE, text));
            tx.put("aadhaarLast4", match(AADHAAR_LAST4, text));
            tx.put("bankName", match(BANK, text));
            tx.put("fee", parseOptional(match(FEE, text)));
            tx.put("commission", parseOptional(match(COMMISSION, text)));
            tx.put("occurredAt", java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC).toString());
            tx.put("screenSource", "accessibility");
            tx.put("confidence", 0.85);
            return tx;
        } catch (Exception e) {
            return null;
        }
    }

    private void sendToServer(JSONObject tx) {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                String apiUrl = SecureTokenStore.getApiUrl(this);
                String token = SecureTokenStore.getAccessToken(this);
                if (apiUrl.isEmpty() || token.isEmpty()) {
                    AepsCollectorPlugin.recordSync(this, false, "Collector API session is not configured.");
                    return;
                }
                URL url = new URL(apiUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(15000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("Authorization", "Bearer " + token);
                byte[] payload = tx.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(payload.length);
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(payload);
                }
                int status = connection.getResponseCode();
                if (status >= 200 && status < 300) {
                    AepsCollectorPlugin.recordSync(this, true, "");
                } else {
                    InputStream stream = connection.getErrorStream();
                    String body = stream == null ? "" : read(stream);
                    AepsCollectorPlugin.recordSync(this, false, "HTTP " + status + (body.isEmpty() ? "" : ": " + body.substring(0, Math.min(body.length(), 300))));
                }
            } catch (Exception e) {
                AepsCollectorPlugin.recordSync(this, false, e.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private JSONObject getPackageConfig(String packageName) {
        JSONArray configs = AepsCollectorPlugin.configuredPackages(this);
        for (int i = 0; i < configs.length(); i++) {
            JSONObject item = configs.optJSONObject(i);
            if (item != null && packageName.equalsIgnoreCase(item.optString("packageName"))) return item;
        }
        return null;
    }

    private boolean isConfiguredPackage(String packageName) {
        return getPackageConfig(packageName) != null;
    }

    private static String match(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? matcher.group(1).trim() : null;
    }

    private static double parseNumber(String raw) {
        try { return Double.parseDouble(raw.replace(",", "").replace("₹", "").trim()); } catch (Exception e) { return -1; }
    }

    private static Double parseOptional(String raw) {
        if (raw == null) return null;
        double n = parseNumber(raw);
        return n < 0 ? null : n;
    }

    private static String safeUpper(String value, String fallback) {
        String v = value == null ? fallback : value;
        return v == null ? "UNKNOWN" : v.trim().toUpperCase();
    }

    private static String displayName(String code) {
        if ("csc_digipay".equals(code)) return "CSC DigiPay";
        if ("ezeepay".equals(code)) return "ezeepay";
        if ("spice_money".equals(code)) return "Spice Money";
        if ("fino".equals(code)) return "Fino";
        return code;
    }

    private static String read(InputStream input) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) out.append(line);
        return out.toString();
    }
}
