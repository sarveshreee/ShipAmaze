
-- Create a SECURITY DEFINER function that returns effective tab permissions for the calling user
CREATE OR REPLACE FUNCTION public.get_my_tab_permissions(_role app_role)
RETURNS TABLE(tab_key text, enabled boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    COALESCE(u.tab_key, d.tab_key) AS tab_key,
    COALESCE(u.enabled, d.enabled) AS enabled
  FROM 
    (SELECT tp.tab_key, tp.enabled FROM tab_permissions tp WHERE tp.role = _role AND tp.user_id IS NULL) d
  FULL OUTER JOIN
    (SELECT tp.tab_key, tp.enabled FROM tab_permissions tp WHERE tp.role = _role AND tp.user_id = auth.uid()) u
  ON d.tab_key = u.tab_key;
$$;
