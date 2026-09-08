-- Harden the public expense mutation boundary.
-- The browser calls add_expense() as an authenticated user; the function
-- performs authorization using auth.uid()/is_back_office() and then calls
-- the internal posting core. Keep raw table DML closed to authenticated users.

ALTER FUNCTION public.add_expense(date, text, numeric, text, text, uuid, text)
  SECURITY DEFINER;

ALTER FUNCTION public.add_expense(date, text, numeric, text, text, uuid, text)
  SET search_path = public;

REVOKE ALL ON FUNCTION public.add_expense(date, text, numeric, text, text, uuid, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.add_expense(date, text, numeric, text, text, uuid, text)
  TO authenticated, service_role;
