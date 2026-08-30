-- Keep DMT transaction_date aligned to the India business day.
create or replace function public.set_dmt_business_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.service_type = 'dmt' and new.transaction_timestamp is not null then
    new.transaction_date := (new.transaction_timestamp at time zone 'Asia/Kolkata')::date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_dmt_business_date on public.transactions;
create trigger trg_set_dmt_business_date
before insert or update of transaction_timestamp, service_type on public.transactions
for each row execute function public.set_dmt_business_date();
