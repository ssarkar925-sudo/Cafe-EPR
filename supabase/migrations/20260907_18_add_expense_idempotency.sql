ALTER FUNCTION public.add_expense(date,text,numeric,text,uuid,text) RENAME TO add_expense_core;
ALTER FUNCTION public.update_expense(uuid,date,text,numeric,text,uuid,text) RENAME TO update_expense_core;

CREATE OR REPLACE FUNCTION public.add_expense(p_expense_date date,p_category text,p_amount numeric,p_note text,p_idempotency_key text,p_instrument_id uuid DEFAULT NULL,p_method text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE v_acq jsonb; v_result jsonb; v_resource_id uuid;
BEGIN
 v_acq := public.idempotency_acquire('add_expense',p_idempotency_key,jsonb_build_object('p_expense_date',p_expense_date,'p_category',p_category,'p_amount',p_amount,'p_note',p_note,'p_instrument_id',p_instrument_id,'p_method',p_method));
 IF v_acq->>'status'='replay' THEN RETURN COALESCE(v_acq->'response_payload','{}'::jsonb); END IF;
 v_result := public.add_expense_core(p_expense_date,p_category,p_amount,p_note,p_instrument_id,p_method);
 v_resource_id := NULLIF(v_result->>'id','')::uuid;
 PERFORM public.idempotency_commit('add_expense',p_idempotency_key,'completed',v_resource_id,v_result);
 RETURN v_result;
END;$function$;

CREATE OR REPLACE FUNCTION public.update_expense(p_expense_id uuid,p_expense_date date,p_category text,p_amount numeric,p_note text,p_idempotency_key text,p_instrument_id uuid DEFAULT NULL,p_method text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE v_acq jsonb; v_result jsonb;
BEGIN
 v_acq := public.idempotency_acquire('update_expense',p_idempotency_key,jsonb_build_object('p_expense_id',p_expense_id,'p_expense_date',p_expense_date,'p_category',p_category,'p_amount',p_amount,'p_note',p_note,'p_instrument_id',p_instrument_id,'p_method',p_method));
 IF v_acq->>'status'='replay' THEN RETURN COALESCE(v_acq->'response_payload','{}'::jsonb); END IF;
 v_result := public.update_expense_core(p_expense_id,p_expense_date,p_category,p_amount,p_note,p_instrument_id,p_method);
 PERFORM public.idempotency_commit('update_expense',p_idempotency_key,'completed',p_expense_id,v_result);
 RETURN v_result;
END;$function$;

REVOKE EXECUTE ON FUNCTION public.add_expense_core(date,text,numeric,text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.update_expense_core(uuid,date,text,numeric,text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.add_expense(date,text,numeric,text,text,uuid,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.update_expense(uuid,date,text,numeric,text,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_expense(date,text,numeric,text,text,uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.update_expense(uuid,date,text,numeric,text,text,uuid,text) TO authenticated,service_role;
