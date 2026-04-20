
-- Extend products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS short_description TEXT,
  ADD COLUMN IF NOT EXISTS long_description TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS min_order_qty INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS primary_image_index INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS length_cm NUMERIC,
  ADD COLUMN IF NOT EXISTS width_cm NUMERIC,
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC,
  ADD COLUMN IF NOT EXISTS shipping_class TEXT,
  ADD COLUMN IF NOT EXISTS pickup_location_id UUID,
  ADD COLUMN IF NOT EXISTS cod_available BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS returnable BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS fragile BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_percent NUMERIC DEFAULT 18,
  ADD COLUMN IF NOT EXISTS country_of_origin TEXT DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS warranty TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS care_instructions TEXT,
  ADD COLUMN IF NOT EXISTS seo_title TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- Product variants
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID,
  option1_name TEXT,
  option1_value TEXT,
  option2_name TEXT,
  option2_value TEXT,
  option3_name TEXT,
  option3_value TEXT,
  sku TEXT,
  price NUMERIC DEFAULT 0,
  stock INTEGER DEFAULT 0,
  weight TEXT,
  dimensions TEXT,
  image TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own variants"
  ON public.product_variants FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage all variants"
  ON public.product_variants FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);

-- Product requests
CREATE TABLE IF NOT EXISTS public.product_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id UUID,
  name TEXT NOT NULL,
  category TEXT,
  proposed_sku TEXT,
  estimated_price NUMERIC DEFAULT 0,
  description TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  supplier_remarks TEXT,
  priority TEXT DEFAULT 'normal',
  expected_stock INTEGER DEFAULT 0,
  variant_info TEXT,
  compliance_docs JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  admin_remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own requests"
  ON public.product_requests FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage all requests"
  ON public.product_requests FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_product_requests_updated_at
  BEFORE UPDATE ON public.product_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
