-- Harden Quick Sale inventory writes: authorize the canonical RPC and log every stock decrement.
-- This migration is intentionally a small source-level transformation of the existing
-- function so it remains compatible with the current function signature.

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='record_quick_sale_internal'
  limit 1;
  if v_def is null then raise exception 'record_quick_sale_internal not found'; end if;

  v_def := replace(v_def,
    E'begin\r\n  if auth.uid() is null then',
    E'begin\r\n  if auth.uid() is null then\r\n  perform set_config(''erp.internal_stock_mutation_authorized'',''on'',true);');

  v_def := replace(v_def,
    E'        update public.products set stock_qty = stock_qty - v_l_qty, updated_at = now() where id = v_l_product;\r\n      end if;',
    E'        update public.products set stock_qty = stock_qty - v_l_qty, updated_at = now() where id = v_l_product;\r\n        insert into public.stock_movements(product_id,movement_date,movement_type,qty_change,unit_cost,stock_after,ref_type,ref_id,remarks,created_by)\r\n        values(v_l_product,p_sale_date,''SALE'',-v_l_qty,coalesce((select cost_price from public.products where id=v_l_product),0),v_stock-v_l_qty,''quick_sale'',v_id,''Quick sale ''||v_number,auth.uid());\r\n      end if;');

  v_def := replace(v_def,
    E'    update public.products set stock_qty = stock_qty - 1, updated_at = now() where id = p_product_id;\r\n  end if;',
    E'    update public.products set stock_qty = stock_qty - 1, updated_at = now() where id = p_product_id;\r\n    insert into public.stock_movements(product_id,movement_date,movement_type,qty_change,unit_cost,stock_after,ref_type,ref_id,remarks,created_by)\r\n    values(p_product_id,p_sale_date,''SALE'',-1,coalesce((select cost_price from public.products where id=p_product_id),0),v_stock-1,''quick_sale'',v_id,''Quick sale ''||v_number,auth.uid());\r\n  end if;');

  execute v_def;
end $$;
