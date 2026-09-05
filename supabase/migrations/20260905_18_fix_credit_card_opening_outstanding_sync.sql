begin;

-- Credit-card opening outstanding is stored in payment_instruments.opening_balance.
-- Keep the legacy details.used_limit field synchronized so existing account-balance
-- consumers immediately include the opening outstanding in used/available credit.
update public.payment_instruments
set details = jsonb_set(
  coalesce(details, '{}'::jsonb),
  '{used_limit}',
  to_jsonb(coalesce(opening_balance, 0)::numeric),
  true
)
where type = 'credit_card'
  and coalesce(opening_balance, 0) > 0
  and (
    coalesce(details->>'used_limit', '') = ''
    or coalesce((details->>'used_limit')::numeric, 0) = 0
  );

create or replace function public.sync_credit_card_used_limit()
returns trigger
language plpgsql
as $$
declare
  old_opening numeric := coalesce(old.opening_balance, 0);
  new_opening numeric := coalesce(new.opening_balance, 0);
  old_used numeric := coalesce(nullif(old.details->>'used_limit','')::numeric, 0);
begin
  if new.type = 'credit_card' then
    if coalesce(new.details->>'credit_limit','') = '' then
      raise exception 'Credit Card requires a credit_limit';
    end if;
    if (new.details->>'credit_limit')::numeric <= 0 then
      raise exception 'Credit Card credit_limit must be greater than zero';
    end if;

    -- On insert, or when opening_balance changes and the stored used_limit was
    -- still anchored to the previous opening balance, move the opening
    -- utilization with it.
    if tg_op = 'INSERT'
       or (
         tg_op = 'UPDATE'
         and new.opening_balance is distinct from old.opening_balance
         and abs(old_used - old_opening) <= 0.01
       )
       or coalesce(new.details->>'used_limit','') = '' then
      new.details := jsonb_set(
        coalesce(new.details, '{}'::jsonb),
        '{used_limit}',
        to_jsonb(new_opening::numeric),
        true
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_credit_card_used_limit on public.payment_instruments;
create trigger trg_sync_credit_card_used_limit
before insert or update of type, opening_balance, details
on public.payment_instruments
for each row execute function public.sync_credit_card_used_limit();

commit;
