-- Canonical accounting account identities.
-- Account codes remain presentation identifiers; system_key is the stable business role.
-- Reports and posting logic must reference system_key, never a hard-coded display code.

alter table public.accounting_accounts
  add column if not exists system_key text;

create unique index if not exists accounting_accounts_system_key_uidx
  on public.accounting_accounts(system_key)
  where system_key is not null;

insert into public.accounting_accounts(code, name, account_type, system_key)
values
  ('4100', 'Purchase Returns', 'income', 'PURCHASE_RETURNS'),
  ('5210', 'Cash Shortage / (Overage)', 'expense', 'CASH_VARIANCE')
on conflict (code) do update
set name = excluded.name,
    account_type = excluded.account_type,
    system_key = coalesce(public.accounting_accounts.system_key, excluded.system_key);

update public.accounting_accounts set system_key = 'CASH' where code = '1000' and system_key is null;
update public.accounting_accounts set system_key = 'BANK' where code = '1010' and system_key is null;
update public.accounting_accounts set system_key = 'UPI_QR' where code = '1020' and system_key is null;
update public.accounting_accounts set system_key = 'WALLET' where code = '1030' and system_key is null;
update public.accounting_accounts set system_key = 'AEPS_FLOAT' where code = '1040' and system_key is null;
update public.accounting_accounts set system_key = 'DMT_FLOAT' where code = '1050' and system_key is null;
update public.accounting_accounts set system_key = 'CREDIT_CARD_FLOAT' where code = '1060' and system_key is null;
update public.accounting_accounts set system_key = 'INVENTORY' where code = '1200' and system_key is null;
update public.accounting_accounts set system_key = 'ACCOUNTS_RECEIVABLE' where code = '1300' and system_key is null;
update public.accounting_accounts set system_key = 'BUSINESS_CLEARING' where code = '1400' and system_key is null;
update public.accounting_accounts set system_key = 'ACCOUNTS_PAYABLE' where code = '2000' and system_key is null;
update public.accounting_accounts set system_key = 'GST_OUTPUT' where code = '2100' and system_key is null;
update public.accounting_accounts set system_key = 'GST_INPUT' where code = '2200' and system_key is null;
update public.accounting_accounts set system_key = 'OWNER_EQUITY' where code = '3000' and system_key is null;
update public.accounting_accounts set system_key = 'PRODUCT_SALES' where code = '4000' and system_key is null;
update public.accounting_accounts set system_key = 'SERVICE_REVENUE' where code = '4010' and system_key is null;
update public.accounting_accounts set system_key = 'SERVICE_FEES' where code = '4020' and system_key is null;
update public.accounting_accounts set system_key = 'COMMISSION_INCOME' where code = '4030' and system_key is null;
update public.accounting_accounts set system_key = 'COGS' where code = '5000' and system_key is null;
update public.accounting_accounts set system_key = 'SALES_RETURNS' where code = '5100' and system_key is null;
update public.accounting_accounts set system_key = 'INVENTORY_ADJUSTMENT' where code = '5200' and system_key is null;
update public.accounting_accounts set system_key = 'CASH_VARIANCE' where code = '5210' and system_key is null;
update public.accounting_accounts set system_key = 'OPERATING_EXPENSES' where code = '6000' and system_key is null;

-- Guard against duplicate role identities introduced by legacy/manual rows.
with ranked as (
  select id, system_key,
         row_number() over (partition by system_key order by created_at, id) as rn
  from public.accounting_accounts
  where system_key is not null
)
update public.accounting_accounts a
set system_key = null
from ranked r
where a.id = r.id and r.rn > 1;
