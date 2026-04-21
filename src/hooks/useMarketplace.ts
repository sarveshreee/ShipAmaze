import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MOCK_PRODUCTS, MARKETPLACE_CATEGORIES } from "@/data/marketplaceMock";
import type { SupplierProduct } from "@/hooks/useSupplierProducts";

const mapRow = (r: any): SupplierProduct => ({
  id: r.id, name: r.name || "", sku: r.sku || "", category: r.category || "",
  brand: r.brand || "", status: r.status || "active",
  price: Number(r.price) || 0, selling_price: Number(r.selling_price) || 0,
  stock: r.stock || 0, weight: r.weight || "", dimensions: r.dimensions || "",
  hsn: r.hsn || "", short_description: r.short_description || "",
  long_description: r.long_description || "", tags: r.tags || [], unit: r.unit || "pcs",
  min_order_qty: r.min_order_qty || 1,
  images: Array.isArray(r.images) ? r.images : [],
  primary_image_index: r.primary_image_index || 0,
  length_cm: r.length_cm, width_cm: r.width_cm, height_cm: r.height_cm,
  shipping_class: r.shipping_class || "standard", pickup_location_id: r.pickup_location_id,
  cod_available: r.cod_available ?? true, returnable: r.returnable ?? true, fragile: r.fragile ?? false,
  gst_percent: Number(r.gst_percent) || 18, country_of_origin: r.country_of_origin || "India",
  warranty: r.warranty || "", manufacturer: r.manufacturer || "",
  care_instructions: r.care_instructions || "", seo_title: r.seo_title || "",
  seo_description: r.seo_description || "", internal_notes: r.internal_notes || "",
  created_at: r.created_at, updated_at: r.updated_at, user_id: r.user_id,
  vendor_id: r.vendor_id || null, vendor_name: r.vendor_name || null,
  uploaded_by_role: r.uploaded_by_role || null,
});

export function useMarketplaceProducts() {
  const { isDemoMode } = useAuth();
  const [live, setLive] = useState<SupplierProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    if (isDemoMode) { setLive([]); setIsLoading(false); return; }
    const { data } = await supabase.from("products").select("*").eq("status", "active").order("created_at", { ascending: false });
    setLive((data || []).map(mapRow));
    setIsLoading(false);
  }, [isDemoMode]);

  useEffect(() => { void load(); }, [load]);

  // Hybrid: combine live + mock so page is always rich
  const products = useMemo(() => {
    const liveCats = new Set(live.map(p => p.category).filter(Boolean));
    const mockFiltered = MOCK_PRODUCTS.filter(m => !liveCats.has(m.category) ? true : true);
    return [...live, ...mockFiltered];
  }, [live]);

  const grouped = useMemo(() => {
    const map = new Map<string, SupplierProduct[]>();
    products.forEach(p => {
      const k = p.category || "Other";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    });
    return map;
  }, [products]);

  const featured = useMemo(() => products.slice(0, 8), [products]);

  return { products, grouped, featured, isLoading, refetch: load, categories: MARKETPLACE_CATEGORIES };
}

export function useMarketplaceProduct(id: string | undefined) {
  const { products, isLoading } = useMarketplaceProducts();
  const product = useMemo(() => products.find(p => p.id === id), [products, id]);
  return { product, isLoading };
}
