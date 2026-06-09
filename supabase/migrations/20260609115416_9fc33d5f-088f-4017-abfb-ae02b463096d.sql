
-- 1) Restrict public rounds visibility to published rounds only
DROP POLICY IF EXISTS "Rounds are publicly readable" ON public.rounds;
CREATE POLICY "Rounds are publicly readable"
ON public.rounds
FOR SELECT
TO public
USING (status = 'published'::round_status);

-- 2) Convert has_role to SECURITY INVOKER and lock down EXECUTE privileges.
--    Since user_roles has a SELECT policy allowing users to read their own row,
--    has_role(auth.uid(), ...) still works under INVOKER for the calling user.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
