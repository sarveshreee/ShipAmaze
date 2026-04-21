-- KYC Profiles
CREATE TABLE public.kyc_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  account_type text NOT NULL DEFAULT 'individual',
  status text NOT NULL DEFAULT 'draft',
  full_name text,
  business_name text,
  dob date,
  pan_number text,
  aadhaar_number text,
  gst_number text,
  cin_number text,
  authorized_person_name text,
  authorized_person_pan text,
  address text,
  uploaded_docs jsonb DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kyc_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own kyc" ON public.kyc_profiles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all kyc" ON public.kyc_profiles
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update kyc" ON public.kyc_profiles
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- Bank Accounts
CREATE TABLE public.bank_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  account_holder_name text NOT NULL,
  account_number_masked text NOT NULL,
  account_number_raw text,
  ifsc text NOT NULL,
  bank_name text NOT NULL,
  account_type text NOT NULL DEFAULT 'Savings',
  status text NOT NULL DEFAULT 'pending',
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own banks" ON public.bank_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all banks" ON public.bank_accounts
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Routing Settings
CREATE TABLE public.routing_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  auto_route_enabled boolean NOT NULL DEFAULT false,
  default_vendor_id uuid,
  default_vendor_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.routing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own routing" ON public.routing_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Team Members
CREATE TABLE public.team_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id uuid NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'Operations',
  permissions text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'invited',
  invited_at timestamptz NOT NULL DEFAULT now(),
  last_resent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id, email)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their team" ON public.team_members
  FOR ALL USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

-- Triggers for updated_at
CREATE TRIGGER update_kyc_profiles_updated_at BEFORE UPDATE ON public.kyc_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_routing_settings_updated_at BEFORE UPDATE ON public.routing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();