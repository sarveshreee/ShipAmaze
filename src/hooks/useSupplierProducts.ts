import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type SupplierProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand: string;
  status: "draft" | "active" | "inactive" | "pending";
  price: number;
  selling_price: number;
  stock: number;
  weight: string;
  dimensions: string;
  hsn: string;
  short_description: string;
  long_description: string;
  tags: string[];
  unit: string;
  min_order_qty: number;
  images: string[];
  primary_image_index: number;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  shipping_class: string;
  pickup_location_id: string | null;
  cod_available: boolean;
  returnable: boolean;
  fragile: boolean;
  gst_percent: number;
  country_of_origin: string;
  warranty: string;
  manufacturer: string;
  care_instructions: string;
  seo_title: string;
  seo_description: string;
  internal_notes: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  uploaded_by_role: "admin" | "vendor" | "dropshipper" | null;
};

const mapRow = (r: any): SupplierProduct => ({
  id: r.id,
  name: r.name || "",
  sku: r.sku || "",
  category: r.category || "",
  brand: r.brand || "",
  status: (r.status as SupplierProduct["status"]) || "draft",
  price: Number(r.price) || 0,
  selling_price: Number(r.selling_price) || 0,
  stock: r.stock || 0,
  weight: r.weight || "",
  dimensions: r.dimensions || "",
  hsn: r.hsn || "",
  short_description: r.short_description || "",
  long_description: r.long_description || "",
  tags: r.tags || [],
  unit: r.unit || "pcs",
  min_order_qty: r.min_order_qty || 1,
  images: Array.isArray(r.images) ? r.images : [],
  primary_image_index: r.primary_image_index || 0,
  length_cm: r.length_cm,
  width_cm: r.width_cm,
  height_cm: r.height_cm,
  shipping_class: r.shipping_class || "standard",
  pickup_location_id: r.pickup_location_id,
  cod_available: r.cod_available ?? true,
  returnable: r.returnable ?? true,
  fragile: r.fragile ?? false,
  gst_percent: Number(r.gst_percent) || 18,
  country_of_origin: r.country_of_origin || "India",
  warranty: r.warranty || "",
  manufacturer: r.manufacturer || "",
  care_instructions: r.care_instructions || "",
  seo_title: r.seo_title || "",
  seo_description: r.seo_description || "",
  internal_notes: r.internal_notes || "",
  created_at: r.created_at,
  updated_at: r.updated_at,
  user_id: r.user_id,
  vendor_id: r.vendor_id || null,
  vendor_name: r.vendor_name || null,
  uploaded_by_role: r.uploaded_by_role || null,
});

export function useSupplierProducts() {
  const { isDemoMode, role, userId } = useAuth();
  const [data, setData] = useState<SupplierProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    if (isDemoMode) {
      const stored = localStorage.getItem("supplier_products_demo");
      let list: SupplierProduct[] = stored ? JSON.parse(stored) : [];
      // Demo role-based filtering
      if (role === "vendor") {
        list = list.filter(p => {
          const owner = p.vendor_id || p.user_id;
          return !owner || owner === "demo-vendor" || owner === userId;
        });
      } else if (role === "dropshipper") {
        list = list.filter(p => p.status === "active");
      }
      setData(list);
      setIsLoading(false);
      return;
    }
    let q = supabase.from("products").select("*").order("created_at", { ascending: false });
    // Role-based filtering (RLS also enforces, this is for clarity)
    if (role === "vendor" && userId) {
      q = q.eq("vendor_id", userId);
    } else if (role === "dropshipper") {
      q = q.eq("status", "active");
    }
    const { data: rows, error } = await q;
    if (!error) setData((rows || []).map(mapRow));
    setIsLoading(false);
  }, [isDemoMode, role, userId]);

  useEffect(() => { void load(); }, [load]);

  return { data, isLoading, refetch: load };
}

export type ProductRequest = {
  id: string;
  request_id: string;
  user_id: string | null;
  name: string;
  category: string;
  proposed_sku: string;
  estimated_price: number;
  description: string;
  images: string[];
  supplier_remarks: string;
  priority: string;
  expected_stock: number;
  variant_info: string;
  compliance_docs: string[];
  status: "draft" | "pending" | "approved" | "rejected" | "needs_changes";
  admin_remark: string;
  created_at: string;
  updated_at: string;
};

export function useProductRequests() {
  const { isDemoMode } = useAuth();
  const [data, setData] = useState<ProductRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    if (isDemoMode) {
      const stored = localStorage.getItem("product_requests_demo");
      setData(stored ? JSON.parse(stored) : []);
      setIsLoading(false);
      return;
    }
    const { data: rows, error } = await supabase
      .from("product_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) {
      setData(
        (rows || []).map((r: any) => ({
          ...r,
          images: Array.isArray(r.images) ? r.images : [],
          compliance_docs: Array.isArray(r.compliance_docs) ? r.compliance_docs : [],
        })) as ProductRequest[]
      );
    }
    setIsLoading(false);
  }, [isDemoMode]);

  useEffect(() => { void load(); }, [load]);

  return { data, isLoading, refetch: load };
}
