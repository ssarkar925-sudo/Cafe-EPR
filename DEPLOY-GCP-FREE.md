# Running the WhatsApp gateway 24/7 on Google Cloud (free tier)

Your gateway currently runs on your PC with `localtunnel`, so it dies whenever the
machine sleeps and the public URL changes every restart. This moves it to an
always-free Google Cloud VM with a stable HTTPS address and automatic restarts.

Total time: about 45 minutes. Read the cost warning in step 1 before you start.

---

## What this gets you

A single `e2-micro` VM in Google's always-free tier, running the hardened
gateway under `systemd` so it survives crashes and reboots, behind Caddy for
automatic HTTPS on a free DuckDNS hostname. The Baileys session lives on the
VM's persistent disk, so a reboot does not require re-scanning the QR code.

---

## Step 1 — Understand the cost before you commit

The always-free tier covers **one** `e2-micro` instance per month, and only in
`us-west1` (Oregon), `us-central1` (Iowa), or `us-east1` (South Carolina). It
also covers 30 GB of standard persistent disk and 1 GB of outbound traffic per
month. Text messages are tiny, so 1 GB is plenty.

**The honest caveat:** Google changed its pricing for external IPv4 addresses in
2024, and attached external IPs are now billable on many configurations. Reports
differ on whether the free-tier `e2-micro` is fully exempt. I could not verify
the current rule while writing this — web access was unavailable — so treat
"completely free" as *likely but unconfirmed*. The exposure if it applies is
roughly a few dollars a month, not hundreds.

Protect yourself in two minutes:

1. Go to **Billing → Budgets & alerts → Create budget**.
2. Set the amount to something small and meaningful to you (₹100 / $2).
3. Tick alerts at 50%, 90%, 100%.

Then check **Billing → Reports** after 48 hours. If you see a charge for
"External IP address", either accept the few dollars or switch to the
Cloudflare Tunnel option in step 9b, which needs no public IP at all.

Also confirm the current rules yourself at
`cloud.google.com/free/docs/free-cloud-features` — free tiers change.

## Step 2 — Create the VM

In the Cloud Console, go to **Compute Engine → VM instances → Create instance**:

| Setting | Value |
| --- | --- |
| Name | `sccomm-whatsapp` |
| Region | `us-central1` (or `us-west1` / `us-east1` — **must** be one of these) |
| Machine type | `e2-micro` (2 shared vCPU, 1 GB) |
| Boot disk | Ubuntu 22.04 LTS, **30 GB, Standard persistent disk** |
| Firewall | tick **Allow HTTP traffic** and **Allow HTTPS traffic** |

Do not pick a balanced or SSD boot disk — only *standard* persistent disk is in
the free tier, and only up to 30 GB.

Note the **External IP** shown in the instance list once it boots.

## Step 3 — Add swap (do not skip this)

1 GB of RAM is not enough to `npm install` Baileys; the install gets OOM-killed
partway through and leaves a broken `node_modules`. Click **SSH** on the
instance row, then:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h          # should now show 2.0Gi of swap
```

## Step 4 — Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v          # expect v20.x
```

## Step 5 — Install just the gateway

Do **not** clone the whole Next.js app onto this box. It would drag in `next`,
`sharp` and `tesseract.js`, which together are larger than the free disk
comfortably holds and heavier than 1 GB of RAM enjoys. The gateway needs four
packages.

```bash
sudo useradd --system --create-home --home-dir /opt/sccomm-gateway sccomm
sudo mkdir -p /opt/sccomm-gateway/scripts
sudo mkdir -p /opt/sccomm-gateway/auth_info_baileys
sudo chown -R sccomm:sccomm /opt/sccomm-gateway
sudo chmod 700 /opt/sccomm-gateway/auth_info_baileys
```

Create `auth_info_baileys` now even though it is empty. The service unit uses
`ProtectSystem=strict` with `ReadWritePaths` pointing at it, and systemd refuses
to start a unit whose `ReadWritePaths` target does not exist yet.

Copy two files up from your PC (run this **locally**, not on the VM — replace
`EXTERNAL_IP`, and use the exact username you SSH with):

```powershell
gcloud compute scp scripts/whatsapp-gateway.js sccomm-whatsapp:~/whatsapp-gateway.js --zone us-central1-a
gcloud compute scp deploy/package.json         sccomm-whatsapp:~/package.json         --zone us-central1-a
```

No `gcloud` CLI? Use the **Upload file** button in the browser SSH window, or
just `sudo nano` the files and paste. Then, back on the VM:

```bash
sudo mv ~/whatsapp-gateway.js /opt/sccomm-gateway/scripts/
sudo mv ~/package.json /opt/sccomm-gateway/
sudo chown -R sccomm:sccomm /opt/sccomm-gateway
cd /opt/sccomm-gateway
sudo -u sccomm npm install --omit=dev
```

The install takes a few minutes on a shared vCPU. If it still gets killed,
confirm swap is active with `free -h`.

## Step 6 — Generate secrets

```bash
openssl rand -hex 32   # -> GATEWAY_API_KEY
openssl rand -hex 16   # -> DASHBOARD_TOKEN
openssl rand -hex 32   # -> SESSION_ENCRYPTION_KEY
```

Keep all three somewhere safe. Write the env file:

```bash
sudo nano /etc/sccomm-gateway.env
```

Paste the contents of `.env.gateway.example` from the repo and fill it in. The
`AUTH_DIR` line must read `/opt/sccomm-gateway/auth_info_baileys`. Then lock it
down — this file holds your service role key:

```bash
sudo chmod 600 /etc/sccomm-gateway.env
sudo chown root:root /etc/sccomm-gateway.env
```

The gateway refuses to start if `GATEWAY_API_KEY` is under 32 characters or
`DASHBOARD_TOKEN` is under 16. That is deliberate — the previous build would
happily boot with no authentication at all.

## Step 7 — Run the database migrations

In the Supabase SQL Editor, run in this order:

1. `supabase/whatsapp-security-fix.sql` — closes the credential leak
2. `supabase/whatsapp-optout.sql` — creates the STOP list

Then store the gateway API key where only the server can read it. The settings
UI still writes keys into the old `config` blob, so set it directly for now:

```sql
update public.whatsapp_gateway_secrets
set gateway_api_key = 'PASTE_YOUR_GATEWAY_API_KEY',
    updated_at = now()
where id = 'default';
```

Run the verification queries at the bottom of the security fix file. The first
one must return zero rows.

## Step 8 — Install the systemd service

```bash
sudo nano /etc/systemd/system/sccomm-gateway.service
```

Paste `deploy/sccomm-gateway.service` from the repo, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sccomm-gateway
sudo systemctl status sccomm-gateway
```

`Restart=always` with a 5-second backoff means a crash, an OOM kill or a reboot
all bring the gateway back on their own. This is what actually delivers 24/7 —
not a self-ping loop.

Follow the logs with `sudo journalctl -u sccomm-gateway -f`.

## Step 9a — Free HTTPS with DuckDNS and Caddy

HTTPS is not optional: your Vercel app sends the API key and customer phone
numbers to this host, and the send route now refuses plain `http://` targets.

Register a free hostname at [duckdns.org](https://www.duckdns.org) (sign in,
pick a subdomain, point it at your VM's external IP). Then:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo nano /etc/caddy/Caddyfile     # paste deploy/Caddyfile, edit the hostname
sudo systemctl reload caddy
```

Caddy fetches and renews a Let's Encrypt certificate automatically. Verify:

```bash
curl https://YOUR-NAME.duckdns.org/health
# {"status":"ok","service":"sccomm-whatsapp-gateway"}
```

Keep DuckDNS pointed correctly if the VM IP ever changes — either reserve a
static IP, or add DuckDNS's updater cron line.

## Step 9b — Alternative: Cloudflare Tunnel

If step 1's IP charge bothers you, or the VM sits behind NAT, a Cloudflare
Tunnel gives you an HTTPS hostname with **no inbound ports and no public IP**.
It needs a domain you have added to Cloudflare.

```bash
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
cloudflared tunnel login
cloudflared tunnel create sccomm-gateway
cloudflared tunnel route dns sccomm-gateway wa.yourdomain.com
sudo cloudflared service install
```

Point the tunnel's ingress at `http://localhost:3001` and skip Caddy entirely.

## Step 10 — Link WhatsApp

Open the pairing screen in a browser — the token is required, and without it the
page returns a plain 404:

```
https://YOUR-NAME.duckdns.org/?token=YOUR_DASHBOARD_TOKEN
```

On the shop phone: **WhatsApp → Settings → Linked Devices → Link a Device**, and
scan. The page flips to "Connected" within a few seconds. Confirm from the VM:

```bash
curl -s https://YOUR-NAME.duckdns.org/status -H "x-api-key: YOUR_GATEWAY_API_KEY" | python3 -m json.tool
```

Because the old plaintext session was publicly readable, **also remove the
previous entry** from Linked Devices. Until you do, anyone who already copied
those keys still has access.

## Step 11 — Point the app at it

In the app: **Settings → Notifications**, set provider to Local/Self-hosted
gateway and the Gateway URL to `https://YOUR-NAME.duckdns.org` (no trailing
slash). Press save, then send a test message to your own number.

Pressing save matters more than it used to. The send route no longer accepts
config from the browser — it reads `whatsapp_templates.config` server-side — so
a provider or gateway URL that only exists in your browser's `localStorage` is
invisible to it. Saving pushes the config to Supabase via
`saveCloudWhatsAppConfig`, which is what the server then reads.

If the test fails, work through it in this order:

```bash
sudo systemctl status sccomm-gateway          # is it running?
sudo journalctl -u sccomm-gateway -n 50       # what did it say?
curl https://YOUR-NAME.duckdns.org/health     # is HTTPS reaching it?
```

A `401` means the key in `whatsapp_gateway_secrets.gateway_api_key` does not
match `GATEWAY_API_KEY` in `/etc/sccomm-gateway.env`. A `503` means the gateway
is up but WhatsApp is not linked — redo step 10.

---

## Running it day to day

```bash
sudo systemctl restart sccomm-gateway         # restart
sudo journalctl -u sccomm-gateway -f          # live logs
sudo journalctl -u sccomm-gateway --since "1 hour ago" | grep '"level":"error"'
free -h                                       # memory and swap
```

Logs are single-line JSON, so `grep` and `jq` both work. Phone numbers are
truncated to the last four digits in the logs on purpose.

If the session ever breaks past repair, clear it and re-scan:

```bash
sudo systemctl stop sccomm-gateway
sudo -u sccomm rm -rf /opt/sccomm-gateway/auth_info_baileys
sudo systemctl start sccomm-gateway
```

---

## The thing to keep in mind about Baileys

This gateway drives WhatsApp Web through an unofficial library. That is against
WhatsApp's terms of service, and the enforcement action is a ban on the phone
number — not a warning. For a café whose WhatsApp number *is* its customer
channel, that is a real business risk, so the defaults here are deliberately
conservative: 3–7 second gaps between sends, one message per number per minute,
250 per day, automatic STOP handling, and a check that each number is actually
registered before sending.

Those limits are what keep the number healthy. Please resist raising them.

You chose transactional-only, which is the low-risk profile: a receipt sent to
someone who just bought coffee is expected and rarely reported. The pattern that
gets numbers banned is unsolicited bulk promotion, because recipients tap
*Report* rather than *Unsubscribe*.

So when you do want to run promotions, don't send them through this gateway.
Use Meta's official Cloud API instead — your send route already has the `meta`
provider path wired for it. It needs a Meta Business account, a dedicated
number, and pre-approved message templates, and marketing templates are billed
per message (low in India, but not free). Customer-initiated service replies
inside the 24-hour window have been free since late 2024, which covers your
support-inbox and chatbot cases. Confirm the current rate card at
`developers.facebook.com/docs/whatsapp/pricing` — pricing moved to per-message
in 2025 and my information predates that change.

One honest summary: free and 24/7 you can have; free, 24/7 *and* compliant bulk
marketing does not exist.

---

## Known gap

The settings UI (`components/settings/notifications-panel.tsx`) still saves the
gateway API key and Meta token into `whatsapp_templates.config`, which every
authenticated staff member can read. Step 7 works around this with a direct SQL
update. The proper fix is a small admin-only API route that writes those fields
to `whatsapp_gateway_secrets` instead — worth doing before you add more staff
accounts. Ask me and I'll build it.
