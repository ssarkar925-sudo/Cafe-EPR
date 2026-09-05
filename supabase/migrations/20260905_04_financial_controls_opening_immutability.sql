-- Financial controls: posted transaction immutability + formal opening-balance GL postings.
-- Idempotent for environments where the opening balances already exist.

create or replace function public.trg_block_posted_transaction_financial_update()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if current_user <> 'postgres' and old.status='success' then
    if new.status is distinct from old.status
       or new.transaction_date is distinct from old.transaction_date
       or new.transaction_timestamp is distinct from old.transaction_timestamp
       or new.customer_id is distinct from old.customer_id
       or new.amount is distinct from old.amount
       or new.service_fee is distinct from old.service_fee
       or new.portal_charge is distinct from old.portal_charge
       or new.portal_commission is distinct from old.portal_commission
       or new.cash_in is distinct from old.cash_in
       or new.cash_out is distinct from old.cash_out
       or new.bank_in is distinct from old.bank_in
       or new.bank_out is distinct from old.bank_out
       or new.pool_out is distinct from old.pool_out
       or new.pool_credit is distinct from old.pool_credit
       or new.pool_credit_type is distinct from old.pool_credit_type
       or new.upi_fee is distinct from old.upi_fee
       or new.pay_from_instrument_id is distinct from old.pay_from_instrument_id
       or new.pay_from_method is distinct from old.pay_from_method
       or new.customer_pay_method is distinct from old.customer_pay_method
       or new.paid_from is distinct from old.paid_from
       or new.fee_source is distinct from old.fee_source
       or new.provider_id is distinct from old.provider_id
       or new.bank_id is distinct from old.bank_id
       or new.portal_id is distinct from old.portal_id
       or new.merchant_qr_id is distinct from old.merchant_qr_id then
      raise exception 'Posted successful transaction financial fields are immutable. Use the reversal/correction workflow.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_posted_transaction_financial_update on public.transactions;
create trigger trg_block_posted_transaction_financial_update
before update on public.transactions
for each row execute function public.trg_block_posted_transaction_financial_update();

create or replace function public.trg_block_posted_transaction_financial_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if current_user <> 'postgres' and old.status='success' then
    raise exception 'Posted successful transaction is immutable. Use the reversal/correction workflow.';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_block_posted_transaction_financial_delete on public.transactions;
create trigger trg_block_posted_transaction_financial_delete
before delete on public.transactions
for each row execute function public.trg_block_posted_transaction_financial_delete();

do $$
declare r record; je_id uuid; pool_account uuid; equity_account uuid;
begin
  select id into equity_account from public.accounting_accounts where code='3000' limit 1;
  if equity_account is null then raise exception 'Owner Equity account 3000 not found'; end if;
  for r in select ob.* from public.opening_balances ob where ob.amount > 0 and not exists (
    select 1 from public.journal_entries je where je.source_type='opening_balance' and je.source_id=ob.id and je.status='posted'
  ) order by ob.id loop
    select id into pool_account from public.accounting_accounts where code = case r.pool
      when 'cash' then '1000' when 'bank' then '1010' when 'wallet' then '1030'
      when 'upi_qr' then '1020' when 'aeps' then '1040' when 'dmt' then '1050'
      when 'credit_card' then '1060' else null end limit 1;
    if pool_account is null then raise exception 'No accounting account mapped for opening pool %', r.pool; end if;
    insert into public.journal_entries(entry_date,source_type,source_id,description,status,posted_by)
    values(r.as_of,'opening_balance',r.id,'Opening balance - '||coalesce(r.remarks,r.pool),'posted',auth.uid()) returning id into je_id;
    if r.pool='credit_card' then
      insert into public.journal_lines(journal_entry_id,account_id,line_no,debit,credit,description) values
        (je_id,equity_account,1,r.amount,0,'Opening equity offset'),
        (je_id,pool_account,2,0,r.amount,'Opening credit-card outstanding');
    else
      insert into public.journal_lines(journal_entry_id,account_id,line_no,debit,credit,description) values
        (je_id,pool_account,1,r.amount,0,'Opening pool balance'),
        (je_id,equity_account,2,0,r.amount,'Opening equity offset');
    end if;
  end loop;
end $$;

create index if not exists idx_journal_entries_opening_balance_source
on public.journal_entries(source_type,source_id) where source_type='opening_balance';
