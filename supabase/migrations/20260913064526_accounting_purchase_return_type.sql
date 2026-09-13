-- Preserve the canonical contra-income classification for purchase returns.
-- Purchase returns reduce COGS and are presented as a credit-side P&L adjustment.
update public.accounting_accounts
set account_type = 'contra_income',
    name = 'Purchase Returns',
    system_key = 'PURCHASE_RETURNS'
where code = '4100';
