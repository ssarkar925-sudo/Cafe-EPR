-- Purchase returns reduce cost of goods sold and therefore use the expense side of the chart.
update public.accounting_accounts
set account_type = 'expense',
    name = 'Purchase Returns',
    system_key = 'PURCHASE_RETURNS'
where code = '4100';
