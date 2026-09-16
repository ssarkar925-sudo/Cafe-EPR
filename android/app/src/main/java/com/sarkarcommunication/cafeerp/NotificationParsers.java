package com.sarkarcommunication.cafeerp;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Provider-specific parsers for transaction notifications (Phase 2).
 *
 * Each adapter extracts, when available: amount, direction, provider/source,
 * reference (UTR/RRN), transaction timestamp, sender/beneficiary, account
 * last-4 (masked forms only), and available balance (only when explicitly
 * labeled as part of the transaction notification).
 *
 * Nothing here assumes field positions across apps: every adapter uses its
 * own keyword/regex rules, and anything below the confidence gate is
 * rejected locally — never uploaded as a financial event.
 */
public final class NotificationParsers {

    private NotificationParsers() {}

    /** Parsed result. confidence < THRESHOLD means "do not create an event". */
    public static final double CONFIDENCE_THRESHOLD = 0.5;

    public static class ParsedNotification {
        public String eventType = "bank_credit";
        public Double amount = null;
        public String direction = "unknown"; // credit | debit | unknown
        public String reference = null;
        public String occurredAt = null; // yyyy-MM-dd or null
        public String senderOrBeneficiary = null;
        public String accountLast4 = null;
        public Double availableBalance = null;
        public String bankName = null;
        public double confidence = 0.0;
        public final List<String> ambiguity = new ArrayList<>();
    }

    public interface NotificationAdapter {
        String providerId();
        ParsedNotification parse(String title, String text);
    }

    // ------------------------------------------------------------------
    // Shared safe extractors (masked/short forms only — never full numbers)
    // ------------------------------------------------------------------

    static String extractAmount(String text) {
        Matcher m = Pattern.compile("(?:Rs\\.?|INR|₹)\\s*([0-9][0-9,]*\\.?[0-9]*)", Pattern.CASE_INSENSITIVE).matcher(text);
        if (m.find()) {
            try {
                double v = Double.parseDouble(m.group(1).replace(",", ""));
                if (v > 0) return String.valueOf(v);
            } catch (NumberFormatException ignored) {}
        }
        return null;
    }

    static Double parseAmountValue(String amount) {
        if (amount == null) return null;
        try {
            double v = Double.parseDouble(amount);
            return v > 0 ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static String extractReference(String text) {
        Matcher m = Pattern.compile("\\b(?:UTR|RRN|Ref(?:erence)?(?:\\s*(?:No\\.?|Number|ID))?|UPI)\\s*[#:=\\-\\.]*\\s*([A-Za-z0-9]{8,28})\\b", Pattern.CASE_INSENSITIVE).matcher(text);
        if (m.find()) return m.group(1);
        Matcher bare = Pattern.compile("(?<![0-9])([0-9]{12})(?![0-9])").matcher(text);
        if (bare.find() && !text.toLowerCase().contains("aadhaar") && !text.matches("(?s).*[xX*#]{2,}.*")) {
            return bare.group(1);
        }
        return null;
    }

    /**
     * Account last-4 ONLY when safe: masked groups (XXXX1234 / ****1234),
     * explicit "last 4 digits / ending" labels, or short labeled fragments.
     * Bare 6+ digit runs are dropped — they may be full account fragments.
     */
    static String extractAccountLast4Safe(String text) {
        Matcher masked = Pattern.compile("(?:[xX*#]{4}\\s*)([0-9]{4})(?![0-9])").matcher(text);
        if (masked.find()) return masked.group(1);
        Matcher labeled = Pattern.compile("\\b(?:last\\s*4(?:\\s*digits?)?|ending(?:\\s*with)?|a\\/c\\s*(?:ending|ends))\\s*[#:=\\-]*\\s*([0-9]{4})(?![0-9])", Pattern.CASE_INSENSITIVE).matcher(text);
        if (labeled.find()) return labeled.group(1);
        return null;
    }

    /** Available balance ONLY when explicitly labeled in the notification. */
    static Double extractBalanceSafe(String text) {
        Matcher m = Pattern.compile("\\b(?:Avail(?:able)?\\s*Bal(?:ance)?|Bal(?:ance)?)\\s*[#:=]?\\s*[₹RsINR.]*\\s*([0-9,]+\\.?[0-9]*)", Pattern.CASE_INSENSITIVE).matcher(text);
        if (!m.find()) return null;
        try {
            double v = Double.parseDouble(m.group(1).replace(",", ""));
            return Double.isFinite(v) ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    static String extractParty(String text, boolean credit) {
        String[] labels = credit
                ? new String[]{"from\\s+([A-Z][A-Za-z]+(?:[ ]+[A-Za-z]+){0,3})", "by\\s+([A-Z][A-Za-z]+(?:[ ]+[A-Za-z]+){0,3})"}
                : new String[]{"to\\s+([A-Z][A-Za-z]+(?:[ ]+[A-Za-z]+){0,3})", "for\\s+([A-Z][A-Za-z]+(?:[ ]+[A-Za-z]+){0,3})"};
        for (String p : labels) {
            Matcher m = Pattern.compile("\\b(?:" + p + ")(?=\\s*[,;.\\n]|\\s+on\\b|$)", Pattern.CASE_INSENSITIVE).matcher(text);
            if (m.find()) {
                String v = m.group(1).trim();
                if (v.length() >= 2 && !v.matches("(?i)^(upi|bank|card|cash|account|transfer)$")) return v;
            }
        }
        return null;
    }

    static String extractBankName(String text, String[] candidates) {
        for (String name : candidates) {
            if (Pattern.compile("\\b" + Pattern.quote(name) + "\\b", Pattern.CASE_INSENSITIVE).matcher(text).find()) {
                return name;
            }
        }
        return null;
    }

    static String extractDate(String text) {
        Matcher m = Pattern.compile("\\b([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4}|[0-9]{1,2}-[A-Za-z]{3}-[0-9]{2,4})\\b").matcher(text);
        if (!m.find()) return null;
        String raw = m.group(1);
        try {
            String[] months = {"jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"};
            String[] parts = raw.split("[-/]");
            int day = Integer.parseInt(parts[0]);
            int month;
            try {
                month = Integer.parseInt(parts[1]);
            } catch (NumberFormatException e) {
                month = 0;
                String token = parts[1].toLowerCase().substring(0, Math.min(3, parts[1].length()));
                for (int i = 0; i < months.length; i++) {
                    if (months[i].equals(token)) { month = i + 1; break; }
                }
            }
            int year = Integer.parseInt(parts[2]);
            if (parts[2].length() == 2) year += year >= 70 ? 1900 : 2000;
            if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000) return null;
            return String.format("%04d-%02d-%02d", year, month, day);
        } catch (Exception e) {
            return null;
        }
    }

    static String directionOf(String text) {
        String lower = text.toLowerCase();
        if (lower.matches("(?s).*\\b(credited|received|deposited|added to|inward)\\b.*")) return "credit";
        if (lower.matches("(?s).*\\b(debited|paid|transferred|withdrawn|spent|outward)\\b.*")) return "debit";
        return "unknown";
    }

    // ------------------------------------------------------------------
    // Adapters
    // ------------------------------------------------------------------

    /** Generic Indian bank SMS/notification shapes (masked values only). */
    public static class BankSmsAdapter implements NotificationAdapter {
        private final String[] bankNames;
        public BankSmsAdapter(String... bankNames) { this.bankNames = bankNames; }
        @Override public String providerId() { return "bank"; }
        @Override public ParsedNotification parse(String title, String text) {
            String body = ((title == null ? "" : title) + "\n" + (text == null ? "" : text)).trim();
            ParsedNotification out = new ParsedNotification();
            if (!body.matches("(?is).*(credited|debited|received|paid|transferred|withdrawn|spent|deposited|balance|rs\\.?|inr|₹|upi|txn|rrn|utr|bank).*")) {
                out.confidence = 0.2;
                out.ambiguity.add("not_recognized_as_financial");
                return out;
            }
            out.direction = directionOf(body);
            Double amount = parseAmountValue(extractAmount(body));
            out.amount = amount;
            out.reference = extractReference(body);
            out.occurredAt = extractDate(body);
            out.senderOrBeneficiary = extractParty(body, "credit".equals(out.direction));
            out.accountLast4 = extractAccountLast4Safe(body);
            out.availableBalance = extractBalanceSafe(body);
            out.bankName = extractBankName(body, bankNames);
            if (body.toLowerCase().contains("upi")) out.eventType = "upi";
            else if ("debit".equals(out.direction)) out.eventType = "bank_debit";
            else out.eventType = "bank_credit";
            double confidence = 0.7;
            if (amount == null) { confidence -= 0.15; out.ambiguity.add("amount_missing"); }
            if (out.reference == null) { confidence -= 0.1; out.ambiguity.add("reference_missing"); }
            if ("unknown".equals(out.direction)) { confidence -= 0.1; out.ambiguity.add("direction_unknown"); }
            out.confidence = Math.max(0, confidence);
            return out;
        }
    }

    /** UPI merchant app alerts (GPay/PhonePe/Paytm style). */
    public static class UpiAdapter implements NotificationAdapter {
        @Override public String providerId() { return "upi"; }
        @Override public ParsedNotification parse(String title, String text) {
            ParsedNotification out = new BankSmsAdapter().parse(title, text);
            out.eventType = "upi";
            return out;
        }
    }

    /** AEPS / micro-ATM receipts (CSC DigiPay style). */
    public static class AepsAdapter implements NotificationAdapter {
        @Override public String providerId() { return "aeps"; }
        @Override public ParsedNotification parse(String title, String text) {
            ParsedNotification out = new BankSmsAdapter().parse(title, text);
            out.eventType = "aeps";
            return out;
        }
    }

    /** Domestic money-transfer receipts. */
    public static class DmtAdapter implements NotificationAdapter {
        @Override public String providerId() { return "dmt"; }
        @Override public ParsedNotification parse(String title, String text) {
            ParsedNotification out = new BankSmsAdapter().parse(title, text);
            String lower = ((title == null ? "" : title) + " " + (text == null ? "" : text)).toLowerCase();
            out.eventType = lower.contains("recharge") || lower.contains("dth") ? "recharge" : "dmt";
            return out;
        }
    }

    /** Recharge / bill-payment confirmations. */
    public static class RechargeAdapter implements NotificationAdapter {
        @Override public String providerId() { return "recharge"; }
        @Override public ParsedNotification parse(String title, String text) {
            ParsedNotification out = new BankSmsAdapter().parse(title, text);
            String lower = ((title == null ? "" : title) + " " + (text == null ? "" : text)).toLowerCase();
            out.eventType = (lower.contains("bill") || lower.contains("electricity")) ? "bill_payment" : "recharge";
            return out;
        }
    }

    /** Fallback: generic structure, lowest baseline confidence. */
    public static class GenericAdapter implements NotificationAdapter {
        @Override public String providerId() { return "generic"; }
        @Override public ParsedNotification parse(String title, String text) {
            ParsedNotification out = new BankSmsAdapter().parse(title, text);
            out.confidence = Math.max(0, out.confidence - 0.1);
            if (out.confidence < 0.6) out.ambiguity.add("generic_adapter_low_confidence");
            return out;
        }
    }

    /** Route a package name to its adapter. Unknown packages get GenericAdapter. */
    public static NotificationAdapter adapterFor(String packageName) {
        String pkg = packageName == null ? "" : packageName.toLowerCase();
        if (pkg.contains("digipay") || pkg.contains("csc")) return new AepsAdapter();
        if (pkg.contains("spice") || pkg.contains("paymonk")) return new DmtAdapter();
        if (pkg.contains("recharge") || pkg.contains("dth")) return new RechargeAdapter();
        if (pkg.contains("phonepe") || pkg.contains("google.android.apps.nbu") || pkg.contains("paytm") || pkg.contains("upi")) {
            return new UpiAdapter();
        }
        if (pkg.contains("bank") || pkg.contains("sbi") || pkg.contains("hdfc") || pkg.contains("icici") || pkg.contains("axis") || pkg.contains("kotak")) {
            return new BankSmsAdapter("State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank");
        }
        return new GenericAdapter();
    }
}
