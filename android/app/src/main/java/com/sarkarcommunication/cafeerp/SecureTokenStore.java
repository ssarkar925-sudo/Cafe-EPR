package com.sarkarcommunication.cafeerp;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureTokenStore {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "CafeERP_AEPS_COLLECTOR_KEY";
    private static final String PREFS = "cafeerp_aeps_secure";
    private static final String ACCESS = "access_token";
    private static final String API_URL = "api_url";

    private static SecretKey getKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        if (!keyStore.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
            generator.init(new KeyGenParameterSpec.Builder(
                    ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build());
            generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) keyStore.getEntry(ALIAS, null)).getSecretKey();
    }

    static void putAccessToken(Context context, String token) {
        try {
            if (token == null || token.trim().isEmpty()) {
                deleteAccessToken(context);
                return;
            }
            byte[] iv = new byte[12];
            new java.security.SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getKey(), new GCMParameterSpec(128, iv));
            byte[] ciphertext = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
            String packed = Base64.encodeToString(iv, Base64.NO_WRAP) + ":" +
                    Base64.encodeToString(ciphertext, Base64.NO_WRAP);
            prefs(context).edit().putString(ACCESS, packed).apply();
        } catch (Exception e) {
            throw new IllegalStateException("Unable to secure collector session.", e);
        }
    }

    static String getAccessToken(Context context) {
        try {
            String packed = prefs(context).getString(ACCESS, "");
            if (packed == null || packed.isEmpty()) return "";
            String[] parts = packed.split(":", 2);
            if (parts.length != 2) return "";
            byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] ciphertext = Base64.decode(parts[1], Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getKey(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

    static void deleteAccessToken(Context context) {
        prefs(context).edit().remove(ACCESS).apply();
    }

    static void putApiUrl(Context context, String apiUrl) {
        prefs(context).edit().putString(API_URL, apiUrl == null ? "" : apiUrl.trim()).apply();
    }

    static String getApiUrl(Context context) {
        return prefs(context).getString(API_URL, "").trim();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
