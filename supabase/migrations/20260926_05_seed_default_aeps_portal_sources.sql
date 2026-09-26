-- Seed the canonical AEPS watcher sources that already exist in the
-- application baseline configuration. The source table was created after the
-- UI baseline, so production needs persistent rows for the 5/3/4 sources
-- shown by the portal tabs.

insert into public.aeps_portal_sources
(
  id, portal_id, portal_name, url, source_type, purpose, is_enabled,
  priority, description, last_checked, last_status, last_message,
  current_published_value, is_archived, created_at, updated_at
)
select
  x.id, x.portal_id::uuid, x.portal_name, x.url, x.source_type, x.purpose,
  x.is_enabled, x.priority, x.description, null::timestamptz,
  x.last_status, x.last_message, x.current_published_value, x.is_archived,
  now(), now()
from jsonb_to_recordset($seed$[
  {"id":"src-1a773d4a-bada-4e3b-9e0e-eca353491979-comm","portal_id":"1a773d4a-bada-4e3b-9e0e-eca353491979","portal_name":"Digipay","url":"https://digipay.csccloud.in/portal/commission-structure","source_type":"web_page","purpose":"commission","is_enabled":true,"priority":1,"description":"Monitors portal payout and commission slabs for AEPS transactions","last_status":"success","last_message":"Baseline published commission verified.","current_published_value":{"commission":4.0,"fee":15.0,"summary":"DigiPay standard AEPS commission: ₹4.00 per ₹2,000-₹5,000","updatedAt":"2026-09-26T00:00:00.000Z"},"is_archived":false},
  {"id":"src-1a773d4a-bada-4e3b-9e0e-eca353491979-fee","portal_id":"1a773d4a-bada-4e3b-9e0e-eca353491979","portal_name":"Digipay","url":"https://digipay.csccloud.in/portal/customer-charges","source_type":"web_page","purpose":"fee","is_enabled":true,"priority":1,"description":"Monitors customer surcharge and operational fees","last_status":"success","last_message":"Baseline customer surcharge verified.","current_published_value":{"fee":15.0,"summary":"Standard customer surcharge: ₹15.00 for ₹2,000+ withdrawal","updatedAt":"2026-09-26T00:00:00.000Z"},"is_archived":false},
  {"id":"src-1a773d4a-bada-4e3b-9e0e-eca353491979-rules","portal_id":"1a773d4a-bada-4e3b-9e0e-eca353491979","portal_name":"Digipay","url":"https://digipay.csccloud.in/aeps/npci-guidelines","source_type":"web_page","purpose":"aeps_rules","is_enabled":true,"priority":2,"description":"Tracks NPCI daily transaction limits, 2FA biometric rules, and compliance","last_status":"success","last_message":"NPCI 2-factor authentication rule active.","current_published_value":{"maxLimit":10000,"summary":"Daily limit ₹10,000 per Aadhaar. Biometric verification required.","updatedAt":"2026-09-26T00:00:00.000Z"},"is_archived":false},
  {"id":"src-1a773d4a-bada-4e3b-9e0e-eca353491979-txn","portal_id":"1a773d4a-bada-4e3b-9e0e-eca353491979","portal_name":"Digipay","url":"https://digipay.csccloud.in/services/aeps-terminal-info","source_type":"web_page","purpose":"transaction_info","is_enabled":true,"priority":1,"description":"Monitors transaction types, supported operations, and RRN format specifications","last_status":"success","last_message":"Cash Withdrawal and Balance Enquiry operational.","current_published_value":{"transactionType":"cash_out","summary":"Standard 12-digit RRN generation active for Cash Withdrawal","updatedAt":"2026-09-26T00:00:00.000Z"},"is_archived":false},
  {"id":"src-1a773d4a-bada-4e3b-9e0e-eca353491979-banks","portal_id":"1a773d4a-bada-4e3b-9e0e-eca353491979","portal_name":"Digipay","url":"https://digipay.csccloud.in/status/issuer-banks","source_type":"web_page","purpose":"provider_bank_info","is_enabled":true,"priority":2,"description":"Monitors issuer bank network status, server downtime alerts, and RRN formats","last_status":"success","last_message":"SBI, PNB, BoB, Canara, HDFC, ICICI, Axis active.","current_published_value":{"bankName":"SBI","summary":"SBI, PNB, BoB, Canara, HDFC, ICICI, Axis operational.","updatedAt":"2026-09-26T00:00:00.000Z"},"is_archived":false},

  {"id":"src-d4cdf097-c5d2-4048-b03c-ed647c9052f4-comm","portal_id":"d4cdf097-c5d2-4048-b03c-ed647c9052f4","portal_name":"Ezeepay","url":"https://ezeepay.com/rates/commission","source_type":"web_page","purpose":"commission","is_enabled":true,"priority":1,"description":"Monitors portal payout and commission slabs for AEPS transactions","last_status":"idle","last_message":"Baseline configured.","current_published_value":{"commission":5.0,"fee":10.0,"summary":"Standard portal commission slab","updatedAt":"2026-09-26T00:00:00.000Z"},"is_archived":false},
  {"id":"src-d4cdf097-c5d2-4048-b03c-ed647c9052f4-fee","portal_id":"d4cdf097-c5d2-4048-b03c-ed647c9052f4","portal_name":"Ezeepay","url":"https://ezeepay.com/rates/fee","source_type":"web_page","purpose":"fee","is_enabled":true,"priority":1,"description":"Monitors customer surcharge and operational fees","last_status":"idle","last_message":"Baseline configured.","current_published_value":{"fee":10.0,"summary":"Standard customer surcharge: ₹10.00","updatedAt":"2026-09-26T00:00:00.000Z"},"is_archived":false},
  {"id":"src-d4cdf097-c5d2-4048-b03c-ed647c9052f4-rules","portal_id":"d4cdf097-c5d2-4048-b03c-ed647c9052f4","portal_name":"Ezeepay","url":"https://ezeepay.com/aeps/rules","source_type":"web_page","purpose":"aeps_rules","is_enabled":true,"priority":2,"description":"Monitors standard AEPS limits and rules","last_status":"idle","last_message":"Baseline configured.","current_published_value":{"maxLimit":10000,"summary":"Standard NPCI withdrawal guidelines","updatedAt":"2026-09-26T00:00:00.000Z"},"is_archived":false},

  {"id":"src-8e668288-99bb-414b-89c4-c4d01ea7d07c-comm","portal_id":"8e668288-99bb-414b-89c4-c4d01ea7d07c","portal_name":"Spice Money","url":"https://b2b.spicemoney.com/pricing/aeps-slabs","source_type":"web_page","purpose":"commission","is_enabled":true,"priority":1,"description":"Monitors portal payout and commission slabs for AEPS transactions","last_status":"success","last_message":"Spice Money Plan A active.","current_published_value":{"commission":7.0,"fee":0.0,"summary":"Spice Money Plan A: ₹7.00 commission on ₹3,000-₹10,000 withdrawal","updatedAt":"2026-09-26T00:00:00.000Z"},"is_archived":false},
  {"id":"src-8e668288-99bb-414b-89c4-c4d01ea7d07c-fee","portal_id":"8e668288-99bb-414b-89c4-c4d01ea7d07c","portal_name":"Spice Money","url":"https://b2b.spicemoney.com/pricing/charges-guide","source_type":"web_page","purpose":"fee","is_enabled":true,"priority":1,"description":"Monitors customer surcharge and operational fees","last_status":"success","last_message":"Zero customer surcharge policy.","current_published_value":{"fee":0.0,"summary":"Zero surcharge on cash withdrawal","updatedAt":"2026-09-26T00:00:00.000Z"},"is_archived":false},
  {"id":"src-8e668288-99bb-414b-89c4-c4d01ea7d07c-rules","portal_id":"8e668288-99bb-414b-89c4-c4d01ea7d07c","portal_name":"Spice Money","url":"https://b2b.spicemoney.com/aeps/security-rules","source_type":"web_page","purpose":"aeps_rules","is_enabled":true,"priority":2,"description":"Monitors NPCI daily limits and security rules","last_status":"success","last_message":"NPCI daily limits enforced.","current_published_value":{"maxLimit":10000,"summary":"Max withdrawal per day ₹10,000. 2FA mandatory.","updatedAt":"2026-09-26T00:00:00.000Z"},"is_archived":false},
  {"id":"src-8e668288-99bb-414b-89c4-c4d01ea7d07c-status","portal_id":"8e668288-99bb-414b-89c4-c4d01ea7d07c","portal_name":"Spice Money","url":"https://b2b.spicemoney.com/status/service-health","source_type":"web_page","purpose":"service_status","is_enabled":true,"priority":3,"description":"Monitors AEPS service health and downtime updates","last_status":"success","last_message":"All AEPS services operational.","current_published_value":{"summary":"All bank switches responding normally.","updatedAt":"2026-09-26T00:00:00.000Z"},"is_archived":false}
]$seed$::jsonb) as x(
  id text,
  portal_id text,
  portal_name text,
  url text,
  source_type text,
  purpose text,
  is_enabled boolean,
  priority integer,
  description text,
  last_status text,
  last_message text,
  current_published_value jsonb,
  is_archived boolean
)
on conflict (portal_id, lower(btrim(url))) where (is_archived = false)
do update set
  portal_name = excluded.portal_name,
  source_type = excluded.source_type,
  purpose = excluded.purpose,
  is_enabled = excluded.is_enabled,
  priority = excluded.priority,
  description = excluded.description,
  last_status = coalesce(public.aeps_portal_sources.last_status, excluded.last_status),
  last_message = coalesce(public.aeps_portal_sources.last_message, excluded.last_message),
  current_published_value = case
    when public.aeps_portal_sources.current_published_value = '{}'::jsonb then excluded.current_published_value
    else public.aeps_portal_sources.current_published_value
  end,
  updated_at = now();
