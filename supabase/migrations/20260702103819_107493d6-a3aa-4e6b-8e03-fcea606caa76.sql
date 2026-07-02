
-- Create trigger on auth.users to run handle_new_user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Allow a signed-in user to (re)assert their own role from the allowed set.
CREATE OR REPLACE FUNCTION public.claim_role(_role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _role NOT IN ('passenger','driver','conductor','sacco_admin') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), _role)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_role(public.app_role) TO authenticated;
