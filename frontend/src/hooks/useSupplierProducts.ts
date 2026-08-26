import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import * as productService from "@/services/productService";
import type { ProductImageValue } from "@/lib/mediaUrl";

function readProductCategories(r: Record<string, unknown>): string[] {
  const list = Array.isArray(r.categories)
    ? r.categories.map((c) => String(c).trim()).filter(Boolean)
    : [];
  const direct = String(r.category ?? "").trim();
  if (direct && !list.some((c) => c.toLowerCase() === direct.toLowerCase())) {
    return [direct, ...list];
  }
  if (list.length > 0) return list;
  return direct ? [direct] : [];
}

function readProductCategory(r: Record<string, unknown>): string {
  return readProductCategories(r)[0] ?? "";
}

export type SupplierProduct = {
  id: string;
  name: string;
  sku: string;
  vendor_sku: string;
  category: string;
  /** All assigned categories (primary + secondary tags like Most Delivered). */
  categories: string[];
  brand: string;
  status: "draft" | "active" | "inactive" | "pending";
  price: number;
  selling_price: number;
  shipping_charge: number;
  our_commission: number;
  stock: number;
  weight: string;
  dimensions: string;
  hsn: string;
  short_description: string;
  long_description: string;
  tags: string[];
  unit: string;
  min_order_qty: number;
  images: ProductImageValue[];
  has_image: boolean;
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

export function mapApiToSupplierProduct(r: Record<string, unknown>): SupplierProduct {
  const id = String(r._id ?? r.id ?? "");
  const categories = readProductCategories(r);
  return {
    id,
    name: String(r.name ?? ""),
    sku: String(r.sku ?? ""),
    vendor_sku: String(r.vendor_sku ?? r.vendorSku ?? ""),
    category: categories[0] ?? readProductCategory(r),
    categories,
    brand: String(r.brand ?? ""),
    status: (r.status as SupplierProduct["status"]) || "draft",
    price: Number(r.price ?? 0),
    selling_price: Number(r.selling_price ?? r.sellingPrice ?? 0),
    shipping_charge: Number(r.shipping_charge ?? r.shippingCharge ?? r.shippingCharges ?? 0),
    our_commission: Number(r.our_commission ?? r.ourCommission ?? r.commission ?? 40),
    stock: Number(r.stock ?? 0),
    weight: String(r.weight ?? ""),
    dimensions: String(r.dimensions ?? ""),
    hsn: String(r.hsn ?? ""),
    short_description: String(r.short_description ?? r.shortDescription ?? ""),
    long_description: String(r.long_description ?? r.longDescription ?? ""),
    tags: (r.tags as string[]) || [],
    unit: String(r.unit ?? "pcs"),
    min_order_qty: Number(r.min_order_qty ?? r.minOrderQty ?? 1),
    images: Array.isArray(r.images) ? (r.images as ProductImageValue[]) : [],
    has_image: Boolean(r.hasImage ?? r.has_image),
    primary_image_index: Number(r.primary_image_index ?? r.primaryImageIndex ?? 0),
    length_cm: (r.length_cm as number | null) ?? (r.lengthCm as number | null) ?? null,
    width_cm: (r.width_cm as number | null) ?? (r.widthCm as number | null) ?? null,
    height_cm: (r.height_cm as number | null) ?? (r.heightCm as number | null) ?? null,
    shipping_class: String(r.shipping_class ?? r.shippingClass ?? "standard"),
    pickup_location_id: (r.pickup_location_id as string | null) ?? (r.pickupLocationId as string | null) ?? null,
    cod_available: Boolean(r.cod_available ?? r.codAvailable ?? true),
    returnable: Boolean(r.returnable ?? true),
    fragile: Boolean(r.fragile ?? false),
    gst_percent: Number(r.gst_percent ?? r.gstPercent ?? 18),
    country_of_origin: String(r.country_of_origin ?? r.countryOfOrigin ?? "India"),
    warranty: String(r.warranty ?? ""),
    manufacturer: String(r.manufacturer ?? ""),
    care_instructions: String(r.care_instructions ?? r.careInstructions ?? ""),
    seo_title: String(r.seo_title ?? r.seoTitle ?? ""),
    seo_description: String(r.seo_description ?? r.seoDescription ?? ""),
    internal_notes: String(r.internal_notes ?? r.internalNotes ?? ""),
    created_at: String(r.createdAt ?? r.created_at ?? new Date().toISOString()),
    updated_at: String(r.updatedAt ?? r.updated_at ?? new Date().toISOString()),
    user_id: (r.user_id as string | null) ?? (r.uploadedBy as string | null) ?? null,
    vendor_id: (r.vendor_id as string | null) ?? (r.vendorId as string | null) ?? null,
    vendor_name: (r.vendor_name as string | null) ?? (r.vendorName as string | null) ?? null,
    uploaded_by_role: (r.uploaded_by_role as SupplierProduct["uploaded_by_role"]) ?? (r.uploadedByRole as SupplierProduct["uploaded_by_role"]) ?? null,
  };
}

export function useSupplierProducts() {
  const { role } = useAuth();
  const [data, setData] = useState<SupplierProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    setIsLoading(!hasLoadedRef.current);
    try {
      const rows = (await productService.listProducts()) as unknown as Record<string, unknown>[];
      let list = rows.map(mapApiToSupplierProduct);
      // Vendor scoping is enforced server-side via Product.vendorId → Vendor._id.
      // Do not re-filter by userId here — vendor_id is the Vendor document id, not the User id.
      if (role === "dropshipper") {
        list = list.filter((p) => p.status === "active");
      }
      setData(list);
      hasLoadedRef.current = true;
    } catch {
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

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
  const [data, setData] = useState<ProductRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = (await productService.listProductRequests()) as unknown as Record<string, unknown>[];
      setData(
        rows.map((r) => ({
          id: String(r.id ?? ""),
          request_id: String(r.request_id ?? r.id ?? ""),
          user_id: (r.user_id as string) ?? null,
          name: String(r.name ?? ""),
          category: String(r.category ?? ""),
          proposed_sku: String(r.proposed_sku ?? ""),
          estimated_price: Number(r.estimated_price ?? 0),
          description: String(r.description ?? ""),
          images: Array.isArray(r.images) ? (r.images as string[]) : [],
          supplier_remarks: String(r.supplier_remarks ?? ""),
          priority: String(r.priority ?? ""),
          expected_stock: Number(r.expected_stock ?? 0),
          variant_info: String(r.variant_info ?? ""),
          compliance_docs: Array.isArray(r.compliance_docs) ? (r.compliance_docs as string[]) : [],
          status: (r.status as ProductRequest["status"]) || "pending",
          admin_remark: String(r.admin_remark ?? ""),
          created_at: String(r.created_at ?? ""),
          updated_at: String(r.updated_at ?? ""),
        }))
      );
    } catch {
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, isLoading, refetch: load };
}
