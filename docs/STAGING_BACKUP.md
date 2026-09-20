# CafeERP Staging Backup — encrypted pg_dump to Google Drive (OAuth 2.0)

Workflow: `.github/workflows/supabase-staging-backup.yml`
Verification Workflow: `.github/workflows/verify-gdrive-target.yml`
Scope: **staging only**. Nothing here may target production.

---

## How it works

1. **Guard (fail closed).** Parses `STAGING_DATABASE_URL` without printing it and aborts unless the scheme is `postgresql://`, port is `5432`, and the hostname matches an approved staging host (staging session pooler `aws-0-ap-south-1.pooler.supabase.com` with staging project reference in the user, or direct staging host `db.plznnfgupoqhdsfwgqna.supabase.co`). Any production host, production project reference, invalid port (such as transaction pooler `6543`), empty URL, unparsable URL, or unrecognized host ⇒ immediate failure.
2. **Connection split.** The URL is decomposed into libpq variables (`PGHOST/PGPORT/PGUSER/PGDATABASE`); the password lives only in a `0600` pgpass file. Secrets never appear in CLI args or logs (full URL and passphrase are masked via `::add-mask::`).
3. **Dump.** Pinned `postgres:18` container runs `pg_dump -Fc -Z6` (custom format, compressed). Client ≥ server version is guaranteed by the pin.
4. **Encrypt.** `openssl enc -aes-256-cbc -pbkdf2 -iter 600000` with `BACKUP_ENCRYPTION_PASSPHRASE`; plaintext is `shred -u` shredded immediately after. Only a SHA256 of the ciphertext is logged.
5. **Emergency artifact fallback.** Retains ciphertext (`*.dump.enc`) for 7 days via GitHub Actions artifacts.
6. **OAuth 2.0 Upload & retention.** Authenticates to Google Drive via OAuth 2.0 using the user's refresh token (using the user's personal Google Drive storage quota). Uploads `cafeerp-staging-<stamp>.dump.enc`, cryptographically verifies remote size and MD5 checksum, and applies retention: always keeps the newest `BACKUP_KEEP_MINIMUM` (7); trashes anything older than `BACKUP_RETENTION_DAYS` (14) beyond that. Local ciphertext is shredded afterwards.

Triggers: daily `30 2 * * *` (UTC) plus manual `workflow_dispatch`.

---

## Required GitHub secrets (repository → Settings → Secrets → Actions)

| Secret | Description | Example / Instructions |
|---|---|---|
| `STAGING_DATABASE_URL` | Staging connection string | `postgresql://postgres.<staging-ref>:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres` (IPv4 session pooler on port 5432). |
| `BACKUP_ENCRYPTION_PASSPHRASE` | Passphrase for AES-256-CBC | Long random string (≥32 chars, e.g. `openssl rand -base64 48`). Store in team vault. |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud OAuth Client ID | `*.apps.googleusercontent.com` from Google Cloud Console. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud OAuth Client Secret | Client secret from Google Cloud Console. |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | Google Drive OAuth Refresh Token | Obtained via `python scripts/gdrive-oauth-consent.py`. |
| `GDRIVE_BACKUP_FOLDER_ID` | Target folder ID in Google Drive | String after `/folders/` in your Drive folder URL. |

---

## Google Drive Setup Guide (Personal Google Drive via OAuth 2.0)

> [!NOTE]
> **Why OAuth 2.0 instead of a Service Account?**
> Google Cloud Service Accounts have a hard platform limit of **0 MB storage quota** in personal Google Drive ("My Drive"). Sharing a personal Drive folder with a service account fails with `storageQuotaExceeded` because storage is billed to the uploader.
> With OAuth 2.0, the GitHub Actions backup workflow authenticates as **your Google user account** and uses your personal Google Drive storage (15 GB free tier, Google One, etc.).

### Step 1: Configure OAuth Consent Screen in Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Select or create your project (e.g. `CafeERP-Backup`).
3. In the search bar, search for **Google Drive API** and ensure it is **Enabled**.
4. In the left navigation, go to **APIs & Services** → **OAuth consent screen**:
   - **User Type**: Select **External** → Click **Create**.
   - **App information**:
     - App name: `CafeERP Backup`
     - User support email: Select your email.
     - Developer contact information: Enter your email.
   - Click **Save and Continue**.
   - **Scopes**: Click **Add or Remove Scopes** → select `.../auth/drive` (or enter `https://www.googleapis.com/auth/drive`) → Click **Save and Continue**.
   - **Test users**: Click **+ Add Users** → enter your personal Google email address → Click **Save and Continue**.
   - Click **Back to Dashboard**. Ensure Publishing status is **Testing**.

### Step 2: Create OAuth 2.0 Client ID
1. In Google Cloud Console, navigate to **APIs & Services** → **Credentials**.
2. Click **+ Create Credentials** → select **OAuth client ID**.
3. **Application type**: Select **Desktop app**.
4. **Name**: `CafeERP Backup Client`.
5. Click **Create**.
6. A dialog appears displaying your **Client ID** and **Client Secret**. (You can also download the JSON).

### Step 3: Run One-Time Consent Flow Locally
On your local computer, open a terminal in `E:\CafeERP` and run:

```bash
python scripts/gdrive-oauth-consent.py
```

- When prompted, paste your **Client ID** and **Client Secret**.
- The script will automatically open your default browser requesting authorization.
- Select your Google account (the one added to "Test users").
- Click **Continue** (past the "Google hasn't verified this app" testing screen) and click **Allow**.
- The script captures the authorization callback, exchanges it for a **Refresh Token**, verifies quota against Google Drive API, and prints:
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `GOOGLE_OAUTH_REFRESH_TOKEN`

### Step 4: Configure GitHub Secrets
1. In GitHub, open: [Cafe-EPR Repository Secrets](https://github.com/ssarkar925-sudo/Cafe-EPR/settings/secrets/actions).
2. Save each of the 4 secrets:
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REFRESH_TOKEN`
   - `GDRIVE_BACKUP_FOLDER_ID` (open your personal Google Drive, create a folder like `CafeERP-Staging-Backups`, and copy the folder ID from the URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`).

### Step 5: Test Without Touching the Database
Run the isolated verification workflow:
1. In GitHub Actions, select **Verify Google Drive Target** → **Run workflow**.
2. Confirm that:
   - OAuth refresh token succeeds.
   - User email and storage quota are logged.
   - Target folder is confirmed write-ready (`canAddChildren: True`).
   - Zero database connections and zero `pg_dump` operations occur.

---

## Restore Procedure

```bash
# 1. Download the newest cafeerp-staging-<stamp>.dump.enc from your Drive folder.
# 2. Decrypt (passphrase from your team vault, never chat/email):
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -in cafeerp-staging-<stamp>.dump.enc -out restore.dump \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE

# 3. Verify contents:
pg_restore --list restore.dump | head

# 4. Restore into an EMPTY staging-equivalent database (never production):
pg_restore --clean --if-exists -d "<empty-staging-target-url>" restore.dump
```

---

## Security Invariants

- **Fail-closed staging guard**: Strictly rejects production hostname `db.tvxehxnvuwojjbhysajp.supabase.co` and user ref `tvxehxnvuwojjbhysajp`.
- **Zero plaintext exposure**: Raw `pg_dump` archive is shredded via `shred -u` before anything is uploaded.
- **Encrypted artifact fallback**: Ciphertext is uploaded as a 7-day workflow artifact in case of transient upload network errors.
- **Masked secrets**: All credentials, tokens, and passphrases are masked in workflow logs via `::add-mask::`.
