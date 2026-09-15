-- Expose the current returns UI's idempotent RPC signature without duplicating
-- the canonical invoice-based accounting implementation.
--
-- Canonical implementation:
--   process_return(uuid invoice_id, jsonb items, numeric refund,
--                  text refund_method, text reason)
-- Current UI boundary:
--   process_return(text idempotency_key, uuid invoice_id, jsonb items,
--                  text reason, numeric refund)

create or replace function public.process_return(
  p_idempotency_key text,
  p_invoice_id uuid,
  p_items jsonb,
  p_reason text,
  p_refund numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate jsonb;
  v_result jsonb;
begin
  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'Not authenticated';
  end if;

  if auth.role() <> 'service_role' and not public.is_back_office() then
    raise exception 'Forbidden';
  end if;

  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Idempotency key is required';
  end if;

  v_gate := public.idempotency_acquire(
    'process_return',
    p_idempotency_key,
    jsonb_build_object(
      'p_invoice_id', p_invoice_id,
      'p_items', p_items,
      'p_reason', p_reason,
      'p_refund', p_refund
    )
  );

  if v_gate->>'status' = 'replay' then
    return v_gate->'response_payload';
  end if;

  -- The canonical implementation performs payment-method-aware refund
  -- allocation itself. The UI does not supply a separate refund method.
  v_result := public.process_return(
    p_invoice_id,
    p_items,
    p_refund,
    'cash',
    coalesce(p_reason, '')
  );

  perform public.idempotency_commit(
    'process_return',
    p_idempotency_key,
    'completed',
    p_invoice_id,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.process_return(text, uuid, jsonb, text, numeric) from public;
revoke all on function public.process_return(text, uuid, jsonb, text, numeric) from anon;
grant execute on function public.process_return(text, uuid, jsonb, text, numeric) to authenticated;
grant execute on function public.process_return(text, uuid, jsonb, text, numeric) to service_role;

notify pgrst, 'reload schema';
