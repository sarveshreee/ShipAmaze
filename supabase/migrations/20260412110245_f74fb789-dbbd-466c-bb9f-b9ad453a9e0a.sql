
-- Table for admin-managed tab permissions
CREATE TABLE public.tab_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  user_id uuid DEFAULT NULL,
  tab_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one entry per role+user+tab
CREATE UNIQUE INDEX idx_tab_permissions_unique ON public.tab_permissions (role, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), tab_key);

ALTER TABLE public.tab_permissions ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage all tab permissions"
  ON public.tab_permissions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can view their own permissions and role defaults
CREATE POLICY "Users can view their tab permissions"
  ON public.tab_permissions FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Timestamp trigger
CREATE TRIGGER update_tab_permissions_updated_at
  BEFORE UPDATE ON public.tab_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
