
-- Orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  customer TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  pincode TEXT,
  weight TEXT,
  courier TEXT,
  payment TEXT NOT NULL DEFAULT 'Prepaid',
  status TEXT NOT NULL DEFAULT 'pending',
  date TEXT,
  awb TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  products JSONB DEFAULT '[]',
  dimensions TEXT,
  zone TEXT,
  pickup_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all orders" ON public.orders FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own orders" ON public.orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own orders" ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own orders" ON public.orders FOR UPDATE
  USING (auth.uid() = user_id);

-- Couriers table
CREATE TABLE public.couriers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 1,
  delivery_rate NUMERIC DEFAULT 0,
  ndr_rate NUMERIC DEFAULT 0,
  rto_rate NUMERIC DEFAULT 0,
  avg_delivery_days INTEGER DEFAULT 3,
  cod_support BOOLEAN DEFAULT true,
  reverse_pickup BOOLEAN DEFAULT false,
  surface_rate NUMERIC DEFAULT 0,
  air_rate NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view couriers" ON public.couriers FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage couriers" ON public.couriers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Manifests table
CREATE TABLE public.manifests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  manifest_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date TEXT,
  courier TEXT,
  orders_count INTEGER DEFAULT 0,
  total_weight TEXT,
  pickup_address TEXT,
  status TEXT NOT NULL DEFAULT 'Generated',
  pickup_time TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.manifests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all manifests" ON public.manifests FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own manifests" ON public.manifests FOR SELECT
  USING (auth.uid() = user_id);

-- Invoices table
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date TEXT,
  period TEXT,
  orders_count INTEGER DEFAULT 0,
  shipping_charges NUMERIC DEFAULT 0,
  cod_charges NUMERIC DEFAULT 0,
  gst NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Unpaid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all invoices" ON public.invoices FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own invoices" ON public.invoices FOR SELECT
  USING (auth.uid() = user_id);

-- Weight disputes table
CREATE TABLE public.weight_disputes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id TEXT,
  awb TEXT,
  courier TEXT,
  seller_weight TEXT,
  courier_weight TEXT,
  diff TEXT,
  charged_amount NUMERIC DEFAULT 0,
  expected_amount NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Open',
  date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.weight_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all disputes" ON public.weight_disputes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own disputes" ON public.weight_disputes FOR SELECT
  USING (auth.uid() = user_id);

-- Transactions table
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  txn_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date TEXT,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'Credit',
  amount NUMERIC NOT NULL DEFAULT 0,
  balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all transactions" ON public.transactions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own transactions" ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

-- NDR orders table
CREATE TABLE public.ndr_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  awb TEXT NOT NULL,
  customer TEXT,
  seller TEXT,
  reason TEXT,
  attempts INTEGER DEFAULT 1,
  last_update TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  phone TEXT,
  next_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ndr_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all NDR" ON public.ndr_orders FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own NDR" ON public.ndr_orders FOR SELECT
  USING (auth.uid() = user_id);

-- Return orders table
CREATE TABLE public.return_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  original_order_id TEXT,
  awb TEXT,
  customer TEXT,
  reason TEXT,
  courier TEXT,
  status TEXT NOT NULL DEFAULT 'Return Requested',
  date TEXT,
  refund_amount NUMERIC DEFAULT 0,
  weight TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.return_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all returns" ON public.return_orders FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own returns" ON public.return_orders FOR SELECT
  USING (auth.uid() = user_id);

-- Products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  weight TEXT,
  price NUMERIC DEFAULT 0,
  selling_price NUMERIC DEFAULT 0,
  stock INTEGER DEFAULT 0,
  hsn TEXT,
  dimensions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all products" ON public.products FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can manage their own products" ON public.products FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Pickup addresses table
CREATE TABLE public.pickup_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pickup_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own addresses" ON public.pickup_addresses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all addresses" ON public.pickup_addresses FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Add updated_at triggers for all tables
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_couriers_updated_at BEFORE UPDATE ON public.couriers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_manifests_updated_at BEFORE UPDATE ON public.manifests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_weight_disputes_updated_at BEFORE UPDATE ON public.weight_disputes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ndr_orders_updated_at BEFORE UPDATE ON public.ndr_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_return_orders_updated_at BEFORE UPDATE ON public.return_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pickup_addresses_updated_at BEFORE UPDATE ON public.pickup_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
