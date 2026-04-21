-- Add vendor ownership tracking to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS vendor_id uuid,
  ADD COLUMN IF NOT EXISTS vendor_name text,
  ADD COLUMN IF NOT EXISTS uploaded_by_role public.app_role;

CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON public.products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);

-- Allow dropshippers (and any authenticated user) to view active catalog products
DROP POLICY IF EXISTS "Authenticated can view active catalog" ON public.products;
CREATE POLICY "Authenticated can view active catalog"
ON public.products
FOR SELECT
TO authenticated
USING (status = 'active');

-- Add vendor tracking to product_requests as well
ALTER TABLE public.product_requests
  ADD COLUMN IF NOT EXISTS vendor_id uuid,
  ADD COLUMN IF NOT EXISTS vendor_name text;
