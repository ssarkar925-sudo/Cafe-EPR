# Setting up WhatsApp Cloud API (the official, no-server route)

This replaces UltraMsg and the Baileys/Render gateway. When you finish, there is
no session to lose, no QR to re-scan and no linked device — so the "logs out
every 10 minutes" problem cannot happen again.

Work through steps 1–5 in the Meta console. Those don't touch the app at all, so
you can prove your credentials work before any code is involved. Steps 6–8 wire
it into CafeERP.

> The Meta console gets redesigned often. Button labels below may not match
> word-for-word — the sequence is what matters. Verify pricing and policy at
> `developers.facebook.com/docs/whatsapp` as you go; rates change and mine may
> be out of date.

---

## Before you start

You need:

- A Facebook account (personal is fine — it only owns the Business account).
- A **new phone number** that is *not* currently on WhatsApp or WhatsApp
  Business, and can receive an SMS or voice call once. This is the big
  constraint. If the number already has WhatsApp on it, you must delete that
  WhatsApp account first and wait for it to clear.
- Your shop's legal/display name for the business profile.

Do **not** use the shop's existing WhatsApp number for this. Migrating a live
number into Cloud API takes it away from the WhatsApp app on the phone — staff
could no longer use it to chat normally. Start with a fresh number.

---

## Step 1 — Create the Meta app

1. Go to `developers.facebook.com` → **My Apps** → **Create App**.
2. When asked what you want to do, pick the option that mentions **WhatsApp** /
   *Other* → app type **Business**.
3. Name it something like `CafeERP WhatsApp`.
4. It will ask for a **Business Account** — create one now if you don't have it.

## Step 2 — Add the WhatsApp product

On the app dashboard, find **WhatsApp** in the product list and click **Set up**.

Meta gives you a **free test number** immediately. Use it. It sends real messages
to a small allow-list of recipients (around five) at no cost, and it lets you
confirm everything works before you commit your real number.

## Step 3 — Add your own phone as a test recipient

In the WhatsApp → **API Setup** panel there is a **To** dropdown. Add your
personal WhatsApp number and confirm the code it sends you. Until a number is on
this list, the test number cannot message it.

## Step 4 — Grab the three values you need

Still on **API Setup**, note down:

| Value | Looks like | Where |
| --- | --- | --- |
| **Phone number ID** | a long digit string | under the test number |
| **Temporary access token** | `EAAG...` | top of the panel |
| **WhatsApp Business Account ID** | a long digit string | same panel |

The temporary token **expires in 24 hours**. That's fine for testing — step 7
replaces it with a permanent one.

## Step 5 — Prove it works with curl (do not skip)

This is the single most valuable step. If this works, the problem is never your
credentials again. Run it from your PC, substituting your values. Note the
recipient format: country code, no `+`, no spaces, no leading zero.

```bash
curl -X POST "https://graph.facebook.com/v21.0/YOUR_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer YOUR_TEMP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "919876543210",
    "type": "template",
    "template": { "name": "hello_world", "language": { "code": "en_US" } }
  }'
```

You should get a JSON response containing a message ID, and a "hello world"
message should arrive on your phone within seconds.

`hello_world` is a pre-approved template Meta ships with every new account. It
works before you've created any templates of your own — which is why we test
with it rather than plain text.

If you get an error, jump to the troubleshooting table at the bottom.

---

## Step 6 — Store the credentials in Supabase

Your credentials belong in `whatsapp_gateway_secrets`, which only the server can
read. Never put them in `whatsapp_templates.config` — every logged-in staff
member can read that table.

Run the two migrations first if you haven't already, in this order:

1. `supabase/whatsapp-security-fix.sql`
2. `supabase/whatsapp-optout.sql`

Then, in the Supabase SQL Editor:

```sql
update public.whatsapp_gateway_secrets
set meta_access_token    = 'PASTE_YOUR_TOKEN',
    meta_phone_number_id = 'PASTE_YOUR_PHONE_NUMBER_ID',
    updated_at           = now()
where id = 'default';
```

## Step 7 — Get a permanent access token

The 24-hour token will die overnight and your receipts will stop. Replace it:

1. Go to `business.facebook.com` → **Business Settings**.
2. **Users → System Users** → **Add**. Name it `cafeerp-sender`, role
   **Employee**.
3. **Add Assets** → your WhatsApp app and your WhatsApp Business Account →
   grant **Full control** (or at minimum `whatsapp_business_messaging`).
4. **Generate New Token** → select your app → tick the scopes
   **`whatsapp_business_messaging`** and **`whatsapp_business_management`**.
5. Choose **Never expires** if offered.

Copy that token immediately — it is shown once. Re-run the SQL in step 6 with
it, then re-run the curl in step 5 to confirm the new token works.

## Step 8 — Point the app at Meta

In the app: **Settings → Notifications**, set the provider to **Meta / Official
Cloud API** and save. Saving matters — the send route reads
`whatsapp_templates.config` server-side, so a provider that only exists in your
browser's localStorage is invisible to it.

> **Two code gaps to be aware of before you test from the app.** The `meta`
> branch in `app/api/whatsapp/send/route.ts` currently sends free-form
> `type: "text"`, which Meta only permits inside a 24-hour window after the
> customer messages you first — a POS receipt sent proactively will be rejected
> with error `131047`. It also passes the phone number through unchanged, so a
> number saved as `09876543210` will fail. Both need fixing before receipts
> work end-to-end. Ask me and I'll do it.

---

## Step 9 — Message templates (the part people get stuck on)

Any message *you* start must use a template Meta approved in advance. Free-form
text is only allowed as a reply within 24 hours of the customer writing to you.

For CafeERP that means your POS invoice, quick sale, banking receipt, due
reminder and day-close messages all need to exist as templates. Create them in
**WhatsApp Manager → Message Templates**:

- Category **Utility** for receipts, order confirmations and payment reminders.
  These are transactional and get approved easily.
- Category **Marketing** for promotions. Approved more slowly, and priced
  higher.
- Use positional variables `{{1}}`, `{{2}}` in the body. Meta does not accept the
  named placeholders your `whatsapp_templates` rows use, so each template needs
  a mapping from your named variables to Meta's numbered ones.

Approval is usually minutes to a few hours. Keep the wording close to what you
actually send; templates get rejected for looking promotional when submitted as
Utility.

## Step 10 — Add your real number

Once the test number proves everything works, in **WhatsApp → API Setup** choose
**Add phone number**. Fill in the display name and business details, then verify
by SMS or call. Meta will push you toward **Business Verification** (uploading a
registration document, utility bill or GST certificate). You can send limited
volumes before verifying; verification raises your limits.

Your new number starts at a low daily unique-recipient cap and scales up
automatically as you send without getting blocked. Don't be alarmed by the
initial limit.

---

## What this actually costs

Honestly: not zero forever, but close to zero for your use.

- **Service conversations** — a customer messages you, you reply within 24
  hours. These have been free since late 2024, which covers your support inbox
  and chatbot cases entirely.
- **Utility templates** — receipts, invoices, payment reminders. Billed per
  message, and Indian utility rates are among the cheapest Meta charges. There
  is also a monthly allowance of free conversations.
- **Marketing templates** — promotions. Billed per message at a higher rate.
  This is where real money appears if you do bulk sends.

Meta moved to per-message pricing during 2025 and my figures predate that, so
check `developers.facebook.com/docs/whatsapp/pricing` for the current India rate
card before you plan any campaign. Set a spend limit in Business Settings →
**Payment Settings** while you learn.

---

## Troubleshooting by error code

| Code | Meaning | Fix |
| --- | --- | --- |
| `131047` | Outside the 24-hour window | Use a template, not free text — see step 9 |
| `131026` | Recipient can't receive | Number not on WhatsApp, or not in your test allow-list |
| `132001` | Template not found | Name or language code mismatch; check exact `en`/`en_US` |
| `133010` | Number not registered | Finish number registration in API Setup |
| `190` | Token expired or invalid | Your temporary token died — do step 7 |
| `100` | Bad parameter | Usually the recipient format; use `919876543210` |
| `470` / `131051` | Re-engagement required | Same as `131047` — template needed |

Two habits that save time: read the `error.error_data.details` field in Meta's
JSON response, it's far more specific than the top-level message; and always
re-run the step 5 curl to isolate whether a failure is Meta's side or your app's.

---

## Cleaning up the old setup

Once Meta sends successfully, retire the rest so nothing competes or leaks:

1. **cron-job.org** — job deleted. (Done.)
2. **Render** — suspend or delete `sccomm-whatsapp-gateway`. It runs the old
   pre-hardening gateway code.
3. **Shop phone** — WhatsApp → Settings → Linked Devices → remove every entry.
   This is what finally invalidates the session credentials that were publicly
   readable through the old Supabase policy.
4. **Supabase** — rotate the service role key (Dashboard → Settings → API).
5. **UltraMsg** — cancel before the trial converts to a paid month.
