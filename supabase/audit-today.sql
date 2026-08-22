-- ============================================================
-- TODAY'S FULL AUDIT REPORT
-- Run in Supabase SQL Editor to audit all today''s data
-- Date: TODAY (uses current_date)
-- ============================================================

-- 1. TODAY'S TRANSACTIONS (all services)
select
  service_type,
  transaction_number,
  status,
  transaction_date,
  amount,
  service_fee,
  portal_commission,
  fee_source,
  paid_from,
  customer_pay_method,
  bank_in,
  bank_out,
  cash_in,
  cash_out,
  pool_credit,
  pool_out,
  pool_credit_type
from public.transactions
where transaction_date = current_date
order by created_at;

-- 2. TODAY'S EXPENSES
select
  category,
  description,
  amount,
  payment_method,
  payment_account_id,
  status,
  expense_date,
  created_at
from public.expenses
where expense_date = current_date
order by created_at;

-- 3. TODAY'S SETTLEMENTS
select
  settlement_number,
  settlement_type,
  settlement_date,
  from_pool,
  to_pool,
  direction,
  amount,
  status,
  created_at
from public.settlements
where settlement_date = current_date
order by created_at;

-- 4. TODAY'S CASH_ENTRIES (what is actually in cashbook)
select
  entry_date,
  method,
  direction,
  amount,
  description,
  ref_type,
  ref_id,
  instrument_id,
  created_at
from public.cash_entries
where entry_date = current_date
order by created_at;

-- 5. CASH_ENTRIES SUMMARY BY METHOD AND DIRECTION (today)
select
  method,
  direction,
  count(*) as entry_count,
  sum(amount) as total_amount
from public.cash_entries
where entry_date = current_date
group by method, direction
order by method, direction;

-- 6. POOL BALANCES AS OF TODAY (from get_pool_balances)
select get_pool_balances(current_date);

-- 7. OPENING BALANCES SEED (most recent per pool)
select
  pool,
  instrument_id,
  amount,
  as_of,
  remarks,
  is_auto,
  created_at
from public.opening_balances
order by pool, as_of desc;

-- 8. PAYMENT INSTRUMENTS WITH OPENING_BALANCE
select
  id,
  name,
  type,
  is_active,
  opening_balance
from public.payment_instruments
where is_active = true
order by type, name;

-- 9. DUPLICATE CASH_ENTRIES CHECK (should return 0 rows if clean)
select ref_type, ref_id, direction, count(*) as duplicate_count
from public.cash_entries
where ref_type = 'transaction'
group by ref_type, ref_id, direction
having count(*) > 1;

-- 10. BANK POOL MOVEMENT BREAKDOWN (to see what makes up the bank figure)
select 'settlements_to_bank' as source, sum(amount) as amount
  from public.settlements where status = 'success' and to_pool = 'bank'
union all
select 'settlements_from_bank', -sum(amount)
  from public.settlements where status = 'success' and from_pool = 'bank'
union all
select 'cash_entries_bank_in', sum(amount)
  from public.cash_entries where method in ('bank','debit_card','card') and direction = 'in'
union all
select 'cash_entries_bank_out', -sum(amount)
  from public.cash_entries where method in ('bank','debit_card','card') and direction = 'out'
union all
select 'transactions_bank_in', sum(bank_in)
  from public.transactions where status = 'success' and bank_in > 0
union all
select 'transactions_bank_out', -sum(bank_out)
  from public.transactions where status = 'success' and bank_out > 0;
