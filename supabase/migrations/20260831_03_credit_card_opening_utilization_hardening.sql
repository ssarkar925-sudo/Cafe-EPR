-- Preserve existing credit-card opening utilization explicitly and enforce
-- the three-concept model: credit limit, used credit, available credit.

begin;

update public.payment_instruments
set details = jsonb_set(
  coalesce(details, '{}'::jsonb),
  '{used_limit}',
  to_jsonb(opening_balance::numeric),
  true
)
where type = 'credit_card'
  and coalesce(details->>'used_limit','') = '0'
  and opening_balance > 0;

create or replace function public.sync_credit_card_used_limit()
returns trigger
language plpgsql
as $$
begin
  if new.type = 'credit_card' then
    if coalesce(new.details->>'credit_limit','') = '' then
      raise exception 'Credit Card requires a credit_limit';
    end if;
    if (new.details->>'credit_limit')::numeric <= 0 then
      raise exception 'Credit Card credit_limit must be greater than zero';
    end if;

    if coalesce(new.details->>'used_limit','') = '' then
      new.details := jsonb_set(
        coalesce(new.details, '{}'::jsonb),
        '{used_limit}',
        to_jsonb(coalesce(new.opening_balance, 0)::numeric),
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
