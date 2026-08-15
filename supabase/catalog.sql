-- Services: rename price -> sale_price, add cost_price (consistent with products)
alter table public.services add column if not exists cost_price numeric(15,2) not null default 0;
alter table public.services rename column price to sale_price;

-- Existing services: backfill cost_price = sale_price so no negative margin
update public.services set cost_price = sale_price where cost_price = 0 and sale_price > 0;
