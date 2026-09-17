package com.sarkarcommunication.cafeerp;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int CAMERA_PERMISSION_REQUEST_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Single native registration path for the app-module AiIngestion plugin.
        // Must run BEFORE super.onCreate(): BridgeActivity builds the Capacitor
        // bridge inside super.onCreate() from this builder, so registering later
        // would silently have no effect. (Auto-discovery via
        // assets/capacitor.plugins.json only lists npm plugin packages, which
        // this project has none of — the manifest is and stays [].)
        registerPlugin(AiIngestionPlugin.class);
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST_CODE);
            }
        }
    }
}
