-- ============================================================================
-- V1 BASELINE — G13: status-transition guards (lock-conflict matrix support).
-- Documented scope ONLY (plan G13): harden the state machines that the
-- G0–G12 RPCs already enforce, so illegal transitions are rejected at the
-- constraint layer even for privileged sessions. No behavior change for any
-- legitimate path (verified: every existing UPDATE on these tables moves
-- exactly within the allowed sets below; teardowns DELETE, never UPDATE).
-- Guard function takes allowed from/to sets via TG_ARGV; it constrains ONLY
-- the status column so legitimate same-statement writes (approver, decided
-- timestamps, resolution notes) keep working. All other columns remain
-- governed by RLS/grants (deny-default, RPC-only writes) as before.
-- Single transaction, fail-closed.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_allow_only_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_from text[];
  v_to   text[];
  v_col  text;
  v_old  text;
  v_new  text;
BEGIN
  -- TG_ARGV[0] = allowed from-states, [1] = allowed to-states,
  -- [2] = status column name (claims use claim_state, not status).
  v_from := string_to_array(TG_ARGV[0], ',');
  v_to   := string_to_array(TG_ARGV[1], ',');
  v_col  := TG_ARGV[2];
  v_old  := to_jsonb(OLD) ->> v_col;
  v_new  := to_jsonb(NEW) ->> v_col;
  IF NOT (v_old = ANY (v_from) AND v_new = ANY (v_to)) THEN
    RAISE EXCEPTION 'Illegal % (%) transition % -> %',
      TG_TABLE_NAME, v_col, v_old, v_new;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_allow_only_transition() FROM PUBLIC;

-- Approvals: pending -> consumed | rejected (G7 request/approve/reject).
CREATE TRIGGER trg_approvals_transition
  BEFORE UPDATE ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.trg_allow_only_transition(
    'pending', 'consumed,rejected', 'status');

-- Claims: recorded -> recognized (G4 recognize; uniform path consumers).
CREATE TRIGGER trg_claims_transition
  BEFORE UPDATE ON public.payment_claims
  FOR EACH ROW EXECUTE FUNCTION public.trg_allow_only_transition(
    'recorded', 'recognized', 'claim_state');

-- Suspense: parked -> resolved | excluded (G12 resolve_suspense).
CREATE TRIGGER trg_suspense_transition
  BEFORE UPDATE ON public.suspense_records
  FOR EACH ROW EXECUTE FUNCTION public.trg_allow_only_transition(
    'parked', 'resolved,excluded', 'status');

COMMIT;
