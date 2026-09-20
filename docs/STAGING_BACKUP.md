# CafeERP Staging Backup — encrypted pg_dump to Google Drive

Workflow: `.github/workflows/supabase-staging-backup.yml`
Scope: **staging only**. Nothing here may target production.

## How it works

1. **Guard (fail closed).** Parses `STAGING_DATABASE_URL` without printing it and aborts unless the scheme is `postgresql://`, port is `5432`, and the hostname matches an approved staging host (staging session pooler `aws-0-ap-south-1.pooler.supabase.com` with staging project reference in the user, or direct staging host `db.plznnfgupoqhdsfwgqna.supabase.co`). Any production host, production project reference, invalid port (such as transaction pooler `6543`), empty URL, unparsable URL, or unrecognized host ⇒ immediate failure.
2. **Connection split.** The URL is decomposed into libpq variables (`PGHOST/PGPORT/PGUSER/PGDATABASE`); the password lives only in a `0600` pgpass file. Secrets never appear in CLI args or logs (full URL and passphrase are masked via `::add-mask::`).
3. **Dump.** Pinned `postgres:18` container runs `pg_dump -Fc -Z6` (custom format, compressed). Client ≥ server version is guaranteed by the pin.
4. **Encrypt.** `openssl enc -aes-256-cbc -pbkdf2 -iter 600000` with `BACKUP_ENCRYPTION_PASSPHRASE`; plaintext is `shred -u` shredded immediately after. Only a SHA256 of the ciphertext is logged.
5. **Upload + retention.** Service-account upload to the Drive folder, then retention: always keep the newest `BACKUP_KEEP_MINIMUM` (7); trash anything older than `BACKUP_RETENTION_DAYS` (14) beyond that. Local ciphertext is shredded afterwards.

Triggers: daily `30 2 * * *` (UTC) plus manual `workflow_dispatch`.

## Required GitHub secrets (repository → Settings → Secrets → Actions)

| Secret | Contents | Notes |
|---|---|---|
| `STAGING_DATABASE_URL` | `postgresql://USER.<staging-ref>:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres` or `postgresql://USER:PASSWORD@db.<staging-ref>.supabase.co:5432/postgres` | **Staging only.** For GitHub Actions runners (IPv4), use the Session Pooler endpoint on port 5432. Port 6543 (transaction mode) is not supported by `pg_dump`. |
| `BACKUP_ENCRYPTION_PASSPHRASE` | Long random string (≥32 chars, generated, e.g. `openssl rand -base64 48`) | Losing this = backups unrecoverable. Store a copy in the team vault. |
| `GDRIVE_SERVICE_ACCOUNT_JSON` | Full service-account key JSON | See setup below. |
| `GDRIVE_BACKUP_FOLDER_ID` | Drive folder ID (the string after `/folders/` in its URL) | Folder must be shared with the service account (Writer). |

## Dedicated staging backup role (least privilege)

Run once against **staging** as an owner (never production):

```sql
CREATE ROLE backup_reader WITH LOGIN PASSWORD '<strong-unique-password>';
GRANT CONNECT ON DATABASE postgres TO backup_reader;
GRANT USAGE ON SCHEMA public TO backup_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO backup_reader;
```

`pg_dump` also needs sequence values; if the dump warns on sequences, add `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO backup_reader;`. Use this role's password in `STAGING_DATABASE_URL`.

## Google Drive setup (least privilege & Google Workspace Shared Drive)

> [!IMPORTANT]
> **Google Workspace Shared Drive is strictly required.**
> Google Cloud Service Accounts (`...@...iam.gserviceaccount.com`) are non-human principals with a **0 MB storage quota** in personal Google Drive ("My Drive"). If `GDRIVE_BACKUP_FOLDER_ID` points to a personal "My Drive" folder, Google Drive API rejects uploads with `storageQuotaExceeded` because storage is billed to the uploader (the service account).
> In a **Google Workspace Shared Drive**, file storage is owned by the workspace organization, not the service account, allowing programmatic uploads.

### Step-by-Step Operator Configuration:

1. **Google Cloud Console**:
   - Open your GCP Project → Enable **Google Drive API**.
   - Navigate to **IAM & Admin** → **Service Accounts** → Create account (e.g. `cafeerp-staging-backup@<project-id>.iam.gserviceaccount.com`).
   - Create and download a JSON key → paste full JSON into GitHub Secret `GDRIVE_SERVICE_ACCOUNT_JSON`.

2. **Google Workspace (Shared Drive)**:
   - Log into Google Drive using a Google Workspace organization account (Business, Enterprise, or Education).
   - In the left navigation menu, click **Shared drives** (formerly Team Drives).
   - Click **+ New** to create a new Shared Drive (e.g., `CafeERP-Backups`).
   - Click **Manage members** at the top right of the Shared Drive.
   - Enter the service account email (`cafeerp-staging-backup@<project-id>.iam.gserviceaccount.com`).
   - Assign the role: **Content manager** (recommended: add, edit, move, delete files) or **Contributor** (add, edit files).
   - *Optional*: Inside the Shared Drive, create a subfolder named `staging-backups`.
   - Open the Shared Drive or subfolder, inspect the browser URL:
     `https://drive.google.com/drive/folders/<FOLDER_ID>`
   - Copy the string after `/folders/` (the `<FOLDER_ID>`).
   - In GitHub repository settings (`Settings` → `Secrets and variables` → `Actions`), save this value as `GDRIVE_BACKUP_FOLDER_ID`.

3. **Preflight Validation in Workflow**:
   - The backup workflow queries the Google Drive API for the target folder metadata (`fields="id,name,driveId"`).
   - If `driveId` is absent (indicating a personal "My Drive" folder), the workflow **fails early during preflight** with an actionable error before attempting any upload, preventing cryptic `storageQuotaExceeded` API exceptions.

4. **Transient Emergency Fallback (Encrypted GitHub Actions Artifact)**:
   - Immediately following encryption and plaintext shredding, the workflow uploads the encrypted ciphertext (`*.dump.enc`) as a workflow artifact named `staging-backup-<timestamp>-encrypted`.
   - **Retention**: Strictly 7 days (transient emergency operational window).
   - **Security**: Uploads **ciphertext only**; plaintext is shredded prior to artifact creation.
   - **Failure Status**: If the Google Drive upload fails or is unconfigured, the overall workflow run status **remains failed**. The artifact fallback provides temporary recovery capability during setup but does not claim permanent backup coverage.

## Restore procedure

```bash
# 1. Download the newest cafeerp-staging-<stamp>.dump.enc from the Drive folder.
# 2. Decrypt (passphrase from the team vault, never chat/email):
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -in cafeerp-staging-<stamp>.dump.enc -out restore.dump \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE
# 3. Verify + restore into an EMPTY staging-equivalent database (never production):
pg_restore --list restore.dump | head
pg_restore --clean --if-exists -d "<empty-target-url>" restore.dump
```

## Safe testing (no production contact)

1. Fill the four secrets with **staging-only** values (double-check the hostname is not production).
2. Actions → Supabase Staging Backup → Run workflow.
3. Expect: guard PASS → dump size logged → ciphertext SHA256 logged → Drive file appears → retention line printed.
4. Negative test: temporarily set `STAGING_DATABASE_URL` to a URL whose host is the production hostname (or empty) in a scratch run — the workflow must fail at the guard step before any dump. Revert immediately.
5. Restore drill quarterly: decrypt + `pg_restore --list` into an empty database.

## Security limitations (read before relying on this)

- The passphrase and service-account key live in GitHub Secrets; anyone with repo admin can read workflow *results* but secrets stay masked. Rotate both if admin membership changes unexpectedly.
- `drive.file` scope + folder sharing limits blast radius to that folder, but a leaked SA key can still delete backups inside it — retention `KEEP_MINIMUM` only guards the workflow's own deletions, not manual/API deletes. Consider a second offline copy for critical milestones.
- The production-host guard is a string comparison against a pinned constant; it cannot detect a *different* production-replica hostname. Human verification of secrets (step: safe testing, item 1) remains mandatory.
- Runner disk is ephemeral, but plaintext exists briefly between dump and encrypt; `shred` mitigates, not eliminates, cloud-disk forensics risk. For higher assurance, stream `pg_dump | openssl` via pipe (future improvement).
- This workflow never touches production by design; there is deliberately no production variant of this file.
