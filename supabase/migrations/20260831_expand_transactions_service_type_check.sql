-- Migration: Expand transactions_service_type_check to allow utility bill payments & Google Play recharges
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_service_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_service_type_check
  CHECK (service_type IN (
    'aeps',
    'dmt',
    'upi',
    'recharge',
    'recharge_due',
    'due',
    'bill_payment',
    'utility_bill',
    'utility',
    'google_play_recharge',
    'google_play'
  ));
