#!/usr/bin/env python3
"""
CafeERP Staging Backup — Google Drive OAuth 2.0 One-Time Consent Tool

This tool executes a local OAuth 2.0 authorization flow to obtain a long-lived
refresh token for automated staging database backups into personal Google Drive ("My Drive").

Usage:
    python scripts/gdrive-oauth-consent.py
    # or with client credentials file:
    python scripts/gdrive-oauth-consent.py --credentials client_secret.json

Requirements:
    - Google Cloud Project with Google Drive API enabled.
    - OAuth 2.0 Client ID (Application type: Desktop app).
    - User added to OAuth consent screen "Test users".
"""

import argparse
import http.server
import json
import os
import sys
import urllib.parse
import urllib.request
import webbrowser

AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
DRIVE_ABOUT_URI = "https://www.googleapis.com/drive/v3/about?fields=user,storageQuota"
SCOPES = ["https://www.googleapis.com/auth/drive"]


class OAuthCallbackHandler(http.server.BaseHTTPRequestHandler):
    """Local HTTP server handler to receive OAuth redirect callback."""
    code = None
    error = None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if "code" in params:
            OAuthCallbackHandler.code = params["code"][0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"""<!DOCTYPE html>
<html>
<head><title>Authorization Successful</title></head>
<body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
    <h2 style="color: #2e7d32;">&#10004; Authorization Successful!</h2>
    <p>Google Drive authorization code received.</p>
    <p>You can close this tab and return to your terminal.</p>
</body>
</html>""")
        else:
            OAuthCallbackHandler.error = params.get("error", ["unknown"])[0]
            self.send_response(400)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(f"""<!DOCTYPE html>
<html>
<head><title>Authorization Failed</title></head>
<body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
    <h2 style="color: #d32f2f;">&#10008; Authorization Failed</h2>
    <p>Error: {OAuthCallbackHandler.error}</p>
    <p>Please return to your terminal for details.</p>
</body>
</html>""".encode("utf-8"))

    def log_message(self, format, *args):
        # Suppress noisy HTTP server logs
        pass


def run_oauth_flow(client_id: str, client_secret: str) -> dict:
    # Bind to an available local port on localhost
    server = http.server.HTTPServer(("127.0.0.1", 0), OAuthCallbackHandler)
    port = server.server_port
    redirect_uri = f"http://127.0.0.1:{port}"

    auth_params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = f"{AUTH_URI}?{urllib.parse.urlencode(auth_params)}"

    print("\n" + "=" * 70)
    print("STEP 1: Authorize Google Drive in your browser")
    print("=" * 70)
    print(f"Opening browser for Google authorization...\nIf it does not open automatically, visit this URL:\n\n{auth_url}\n")

    webbrowser.open(auth_url)

    print("Waiting for authorization in browser...")
    server.handle_request()
    server.server_close()

    if OAuthCallbackHandler.error:
        raise RuntimeError(f"Authorization was rejected or failed: {OAuthCallbackHandler.error}")

    if not OAuthCallbackHandler.code:
        raise RuntimeError("Failed to obtain authorization code.")

    print("\nAuthorization code received! Exchanging code for refresh token...")

    # Exchange authorization code for tokens
    token_payload = urllib.parse.urlencode({
        "code": OAuthCallbackHandler.code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode("utf-8")

    token_req = urllib.request.Request(
        TOKEN_URI,
        data=token_payload,
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "CafeERP-OAuth-Tool"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(token_req) as resp:
            token_data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Token exchange failed (HTTP {e.code}): {err_msg}")

    return token_data


def verify_token(access_token: str) -> dict:
    """Verify access token against Google Drive API about endpoint."""
    req = urllib.request.Request(
        DRIVE_ABOUT_URI,
        headers={"Authorization": f"Bearer {access_token}", "User-Agent": "CafeERP-OAuth-Tool"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    parser = argparse.ArgumentParser(description="Obtain Google Drive OAuth refresh token for CafeERP backups.")
    parser.add_argument("--credentials", "-c", help="Path to Google Cloud client_secret_*.json file.")
    parser.add_argument("--client-id", help="Google Cloud OAuth Client ID.")
    parser.add_argument("--client-secret", help="Google Cloud OAuth Client Secret.")
    args = parser.parse_args()

    client_id = args.client_id or os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    client_secret = args.client_secret or os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")

    if args.credentials and os.path.isfile(args.credentials):
        with open(args.credentials, "r", encoding="utf-8") as f:
            data = json.load(f)
            info = data.get("installed") or data.get("web") or {}
            client_id = info.get("client_id")
            client_secret = info.get("client_secret")

    if not client_id:
        print("\n--- Google Cloud OAuth 2.0 Setup ---")
        client_id = input("Enter Google Cloud OAuth Client ID: ").strip()

    if not client_secret:
        client_secret = input("Enter Google Cloud OAuth Client Secret: ").strip()

    if not client_id or not client_secret:
        print("ERROR: Both Client ID and Client Secret are required.", file=sys.stderr)
        sys.exit(1)

    try:
        tokens = run_oauth_flow(client_id, client_secret)
    except Exception as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        sys.exit(1)

    refresh_token = tokens.get("refresh_token")
    access_token = tokens.get("access_token")

    if not refresh_token:
        print("\nWARNING: No refresh_token was returned by Google.")
        print("This usually happens if the user already granted permission without prompt=consent.")
        print("Revoke access at https://myaccount.google.com/permissions and run this script again.", file=sys.stderr)
        sys.exit(1)

    print("\nVerifying token permissions with Google Drive API...")
    try:
        about = verify_token(access_token)
        user_info = about.get("user", {})
        quota = about.get("storageQuota", {})
        display_name = user_info.get("displayName", "User")
        email = user_info.get("emailAddress", "Unknown")
        limit = int(quota.get("limit", 0))
        usage = int(quota.get("usage", 0))
        free_gb = (limit - usage) / (1024 ** 3) if limit > 0 else 0
        used_gb = usage / (1024 ** 3)

        print("\n" + "=" * 70)
        print("&#10004; GOOGLE DRIVE OAUTH AUTHORIZATION SUCCESSFUL!")
        print("=" * 70)
        print(f"Authenticated User: {display_name} <{email}>")
        if limit > 0:
            print(f"Storage Quota:      {used_gb:.2f} GB used of {limit / (1024**3):.1f} GB ({free_gb:.2f} GB free)")
        else:
            print(f"Storage Quota:      {used_gb:.2f} GB used (Unlimited/Workspace)")
    except Exception as ve:
        print(f"Token verification warning: {ve}")

    print("\n" + "=" * 70)
    print("ACTION REQUIRED: Save these 4 Secrets in GitHub")
    print("URL: https://github.com/ssarkar925-sudo/Cafe-EPR/settings/secrets/actions")
    print("=" * 70)
    print("\n1. Secret Name:  GOOGLE_OAUTH_CLIENT_ID")
    print(f"   Secret Value: {client_id}")
    print("\n2. Secret Name:  GOOGLE_OAUTH_CLIENT_SECRET")
    print(f"   Secret Value: {client_secret}")
    print("\n3. Secret Name:  GOOGLE_OAUTH_REFRESH_TOKEN")
    print(f"   Secret Value: {refresh_token}")
    print("\n4. Secret Name:  GDRIVE_BACKUP_FOLDER_ID")
    print("   Secret Value: <Folder ID from your personal Google Drive URL>")
    print("\n" + "=" * 70)
    print("DO NOT commit these values to Git. Secrets are saved only in GitHub Actions.")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
