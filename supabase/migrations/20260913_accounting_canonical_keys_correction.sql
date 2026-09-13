-- Correct the initial canonical-key rollout: only stable P&L roles are assigned here.
-- Balance-sheet account codes vary across legacy deployments and must not be guessed.
update public.accounting_accounts
set system_key = null
where system_key in (
  'CASH', 'BANK', 'UPI_QR', 'WALLET', 'AEPS_FLOAT', 'DMT_FLOAT',
  'CREDIT_CARD_FLOAT', 'INVENTORY', 'ACCOUNTS_RECEIVABLE', 'BUSINESS_CLEARING',
  'ACCOUNTS_PAYABLE', 'GST_OUTPUT', 'GST_INPUT', 'OWNER_EQUITY'
);

update public.accounting_accounts set system_key = 'PRODUCT_SALES' where code = '4000';
update public.accounting_accounts set system_key = 'SERVICE_REVENUE' where code = '4010';
update public.accounting_accounts set system_key = 'SERVICE_FEES' where code = '4020';
update public.accounting_accounts set system_key = 'COMMISSION_INCOME' where code = '4030';
update public.accounting_accounts set system_key = 'PURCHASE_RETURNS' where code = '4100';
update public.accounting_accounts set system_key = 'COGS' where code = '5000';
update public.accounting_accounts set system_key = 'SALES_RETURNS' where code = '5100';
update public.accounting_accounts set system_key = 'INVENTORY_ADJUSTMENT' where code = '5200';
update public.accounting_accounts set system_key = 'CASH_VARIANCE' where code = '5210';
update public.accounting_accounts set system_key = 'OPERATING_EXPENSES' where code = '6000';
