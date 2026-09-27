package com.sarkarcommunication.cafeerp;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(name = "AepsCollector")
public class AepsCollectorPlugin extends Plugin {
    private static final String PREFS = "cafeerp_aeps_collector";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_PACKAGES = "portal_packages";
    private static final String KEY_LAST_SYNC = "last_sync";
    private static final String KEY_LAST_ERROR = "last_error";

    @PluginMethod
    public void setApiConfig(PluginCall call) {
        String apiUrl = call.getString("apiUrl", "");
        String accessToken = call.getString("accessToken", "");
        SecureTokenStore.putApiUrl(getContext(), apiUrl);
        SecureTokenStore.putAccessToken(getContext(), accessToken);
        call.resolve();
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        SecureTokenStore.deleteAccessToken(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        prefs().edit().putBoolean(KEY_ENABLED, enabled).apply();
        if (enabled) {
            AepsAccessibilityService.requestScan(getContext());
        }
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", prefs().getBoolean(KEY_ENABLED, false));
        ret.put("accessibilityEnabled", isAccessibilityEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void setPortalPackage(PluginCall call) {
        String packageName = call.getString("packageName", "").trim();
        String portalCode = call.getString("portalCode", "unknown").trim();
        String sourceId = call.getString("sourceId", "").trim();
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        if (packageName.isEmpty()) {
            call.reject("packageName is required.");
            return;
        }

        try {
            JSONArray current = new JSONArray(prefs().getString(KEY_PACKAGES, "[]"));
            JSONArray next = new JSONArray();
            for (int i = 0; i < current.length(); i++) {
                JSONObject item = current.optJSONObject(i);
                if (item == null) continue;
                if (!packageName.equalsIgnoreCase(item.optString("packageName"))) {
                    next.put(item);
                }
            }
            if (enabled) {
                JSONObject item = new JSONObject();
                item.put("packageName", packageName);
                item.put("portalCode", portalCode);
                item.put("sourceId", sourceId);
                next.put(item);
            }
            prefs().edit().putString(KEY_PACKAGES, next.toString()).apply();
            call.resolve(new JSObject().put("success", true));
        } catch (Exception e) {
            call.reject("Unable to save portal package.");
        }
    }

    @PluginMethod
    public void getPortalPackages(PluginCall call) {
        try {
            JSONArray current = new JSONArray(prefs().getString(KEY_PACKAGES, "[]"));
            JSArray array = new JSArray();
            for (int i = 0; i < current.length(); i++) array.put(current.optJSONObject(i));
            call.resolve(new JSObject().put("packages", array));
        } catch (Exception e) {
            call.reject("Unable to read portal packages.");
        }
    }

    @PluginMethod
    public void discoverPortalApps(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            List<ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);
            JSArray results = new JSArray();
            String[] terms = new String[]{"digipay", "csc", "ezeepay", "ezee pay", "spice money", "spicemoney", "fino"};
            for (ApplicationInfo app : apps) {
                String label = String.valueOf(pm.getApplicationLabel(app));
                String haystack = (label + " " + app.packageName).toLowerCase();
                boolean match = false;
                for (String term : terms) if (haystack.contains(term)) { match = true; break; }
                if (!match) continue;
                JSObject row = new JSObject();
                row.put("packageName", app.packageName);
                row.put("label", label);
                results.put(row);
            }
            call.resolve(new JSObject().put("apps", results));
        } catch (Exception e) {
            call.reject("Unable to discover installed portal apps.");
        }
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to open Accessibility settings.");
        }
    }

    @PluginMethod
    public void isAccessibilityEnabled(PluginCall call) {
        call.resolve(new JSObject().put("enabled", isAccessibilityEnabled()));
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", prefs().getBoolean(KEY_ENABLED, false));
        ret.put("accessibilityEnabled", isAccessibilityEnabled());
        ret.put("lastSync", prefs().getString(KEY_LAST_SYNC, ""));
        ret.put("lastError", prefs().getString(KEY_LAST_ERROR, ""));
        ret.put("apiConfigured", !SecureTokenStore.getApiUrl(getContext()).isEmpty() && !SecureTokenStore.getAccessToken(getContext()).isEmpty());
        call.resolve(ret);
    }

    static boolean enabled(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false);
    }

    static JSONArray configuredPackages(Context context) {
        try {
            return new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_PACKAGES, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static void recordSync(Context context, boolean ok, String message) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_LAST_SYNC, ok ? new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", java.util.Locale.US).format(new java.util.Date()) : context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LAST_SYNC, ""))
                .putString(KEY_LAST_ERROR, ok ? "" : (message == null ? "Unknown collector error." : message))
                .apply();
    }

    private boolean isAccessibilityEnabled() {
        String enabledServices = Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabledServices == null) return false;
        String expected = new ComponentName(getContext(), AepsAccessibilityService.class).flattenToString();
        return enabledServices.contains(expected);
    }

    private android.content.SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
