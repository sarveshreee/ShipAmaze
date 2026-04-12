
-- Fix 1: Add admin-only write policies on user_roles to prevent privilege escalation
CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: Replace tab_permissions SELECT policy to restrict global rows to admins
DROP POLICY IF EXISTS "Users can view their tab permissions" ON public.tab_permissions;

CREATE POLICY "Users can view their own tab permissions"
ON public.tab_permissions
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (user_id IS NULL AND public.has_role(auth.uid(), 'admin'::app_role))
);
