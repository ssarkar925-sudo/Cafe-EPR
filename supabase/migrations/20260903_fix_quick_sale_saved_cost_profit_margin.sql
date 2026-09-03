-- Fix Quick Sale saved-cost accounting for itemized sales.
-- Product/service costs remain catalog snapshots; Custom Item costs come from the
-- client-supplied line cost snapshot (cost or legacy cost_price field).
-- This keeps quick_sales.cost and quick_sale_items.cost consistent for P&L.

do $$
declare
  v_def text;
  v_current text;
begin
  select pg_get_functiondef(p.oid) into v_current
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='record_quick_sale_internal'
  limit 1;

  if v_current is null then
    raise exception 'record_quick_sale_internal not found';
  end if;

  v_def := replace(v_current,
    E'      elsif v_l_name is null then\n        raise exception ''Each item needs a product, service or name'';\n      end if;',
    E'      elsif v_l_name is null then\n        raise exception ''Each item needs a product, service or name'';\n      else\n        v_l_cost := coalesce(nullif(v_line->>''cost'','''')::numeric, nullif(v_line->>''cost_price'','''')::numeric, 0);\n        if v_l_cost < 0 then raise exception ''Invalid cost''; end if;\n        v_l_cost := round(v_l_qty * v_l_cost, 2);\n      end if;');

  v_def := replace(v_def,
    E'      elsif v_l_service is not null then\n        select s.cost_price into v_l_cost from public.services s where s.id = v_l_service;\n        v_l_cost := round(v_l_qty * coalesce(v_l_cost, 0), 2);\n      end if;\n      insert into public.quick_sale_items',
    E'      elsif v_l_service is not null then\n        select s.cost_price into v_l_cost from public.services s where s.id = v_l_service;\n        v_l_cost := round(v_l_qty * coalesce(v_l_cost, 0), 2);\n      else\n        v_l_cost := coalesce(nullif(v_line->>''cost'','''')::numeric, nullif(v_line->>''cost_price'','''')::numeric, 0);\n        if v_l_cost < 0 then raise exception ''Invalid cost''; end if;\n        v_l_cost := round(v_l_qty * v_l_cost, 2);\n      end if;\n      insert into public.quick_sale_items');

  if v_def = v_current then
    raise exception 'Quick Sale saved-cost patch made no changes';
  end if;

  execute v_def;
end $$;
