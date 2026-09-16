package com.sarkarcommunication.cafeerp;

import android.content.Intent;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashSet;
import java.util.Set;

/**
 * Capacitor bridge for the AI ingestion phone collector.
 * Exposes source allowlist management, API configuration, queue status,
 * manual sync, and the system notification-listener settings screen.
 * No notification content ever passes through this bridge.
 */
@CapacitorPlugin(name = "AiIngestion")
public class AiIngestionPlugin extends Plugin {

    @PluginMethod
    public void getStatus(PluginCall call) {
        try {
            JSObject ret = new JSObject();
            ret.put("status", AiIngestionListenerService.statusSnapshot(getContext()).toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Unable to read collector status.");
        }
    }

    @PluginMethod
    public void getAllowedSources(PluginCall call) {
        Set<String> allowed = getContext()
                .getSharedPreferences(AiIngestionListenerService.PREFS, android.content.Context.MODE_PRIVATE)
                .getStringSet(AiIngestionListenerService.KEY_SOURCES, new HashSet<String>());
        JSObject ret = new JSObject();
        ret.put("sources", allowed == null ? new String[0] : allowed.toArray(new String[0]));
        call.resolve(ret);
    }

    @PluginMethod
    public void setSourceAllowed(PluginCall call) {
        String pkg = call.getString("package", "");
        Boolean allowed = call.getBoolean("allowed", false);
        if (pkg == null || pkg.trim().isEmpty()) {
            call.reject("package is required.");
            return;
        }
        Set<String> current = new HashSet<>(getContext()
                .getSharedPreferences(AiIngestionListenerService.PREFS, android.content.Context.MODE_PRIVATE)
                .getStringSet(AiIngestionListenerService.KEY_SOURCES, new HashSet<String>()));
        if (Boolean.TRUE.equals(allowed)) current.add(pkg.trim());
        else current.remove(pkg.trim());
        getContext()
                .getSharedPreferences(AiIngestionListenerService.PREFS, android.content.Context.MODE_PRIVATE)
                .edit()
                .putStringSet(AiIngestionListenerService.KEY_SOURCES, current)
                .apply();
        call.resolve();
    }

    @PluginMethod
    public void setApiConfig(PluginCall call) {
        String apiUrl = call.getString("apiUrl", "");
        String workerKey = call.getString("workerKey", "");
        getContext()
                .getSharedPreferences(AiIngestionListenerService.PREFS, android.content.Context.MODE_PRIVATE)
                .edit()
                .putString(AiIngestionListenerService.KEY_API_URL, apiUrl == null ? "" : apiUrl.trim())
                .putString(AiIngestionListenerService.KEY_WORKER_KEY, workerKey == null ? "" : workerKey.trim())
                .apply();
        call.resolve();
    }

    @PluginMethod
    public void setCollectionEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", false);
        getContext()
                .getSharedPreferences(AiIngestionListenerService.PREFS, android.content.Context.MODE_PRIVATE)
                .edit()
                .putBoolean(AiIngestionListenerService.KEY_ENABLED, Boolean.TRUE.equals(enabled))
                .apply();
        call.resolve();
    }

    @PluginMethod
    public void isCollectionEnabled(PluginCall call) {
        boolean enabled = getContext()
                .getSharedPreferences(AiIngestionListenerService.PREFS, android.content.Context.MODE_PRIVATE)
                .getBoolean(AiIngestionListenerService.KEY_ENABLED, false);
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void isListenerSystemEnabled(PluginCall call) {
        boolean enabled = false;
        try {
            String flat = android.provider.Settings.Secure.getString(
                    getContext().getContentResolver(), "enabled_notification_listeners");
            String me = new android.content.ComponentName(
                    getContext(), AiIngestionListenerService.class).flattenToString();
            enabled = flat != null && flat.contains(me);
        } catch (Exception e) {
            enabled = false;
        }
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void openListenerSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to open notification listener settings.");
        }
    }
}
