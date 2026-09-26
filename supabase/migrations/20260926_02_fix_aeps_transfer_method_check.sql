-- Fix the transactions.transfer_method check so AEPS transaction methods are
-- accepted alongside existing DMT/UPI methods.
--
-- The previous check was accidentally limited to DMT methods only:
--   bank_account, upi
-- which caused AEPS Approve & Save to fail when it inserted cash_out,
-- balance_enquiry, or mini_statement into transfer_method.
--
-- Keep legacy aliases for existing historical/application compatibility.

alter table public.transactions
  drop constraint if exists transactions_transfer_method_check;

alter table public.transactions
  add constraint transactions_transfer_method_check
  check (
    transfer_method is null
    or transfer_method = any (array[
      'bank_account'::text,
      'upi'::text,
      'qr'::text,
      'cash_out'::text,
      'cash_withdrawal'::text,
      'withdrawal'::text,
      'payment_collection'::text,
      'collection'::text,
      'aadhaar_pay'::text,
      'balance_enquiry'::text,
      'enquiry'::text,
      'mini_statement'::text,
      'statement'::text
    ])
  );

notify pgrst, 'reload schema';
