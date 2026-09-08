-- UPI `cut_from_payment` semantics:
-- the merchant receives the gross UPI payment; the service fee reduces
-- the cash payout to the customer. Therefore pool_credit is gross amount.

do $$
declare d text;
begin
  select pg_get_functiondef('public.create_business_txn(text,date,timestamp with time zone,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,numeric)'::regprocedure) into d;
  d := replace(d,
$old$      elsif p_fee_source='cut_from_payment' then
        v_pool_credit:=greatest(0,p_amount-v_fee);
        v_cash_out:=greatest(0,p_amount-v_fee);
$old$,
$new$      elsif p_fee_source='cut_from_payment' then
        v_pool_credit:=p_amount;
        v_cash_out:=greatest(0,p_amount-v_fee);
$new$);
  execute d;

  select pg_get_functiondef('public.update_business_txn(uuid,date,timestamp with time zone,uuid,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text)'::regprocedure) into d;
  d := replace(d,
$old$      elsif p_fee_source = 'cut_from_payment' then
        v_pool_credit := greatest(0, p_amount - v_fee);
        v_cash_out := greatest(0, p_amount - v_fee);
$old$,
$new$      elsif p_fee_source = 'cut_from_payment' then
        v_pool_credit := p_amount;
        v_cash_out := greatest(0, p_amount - v_fee);
$new$);
  execute d;
end $$;
