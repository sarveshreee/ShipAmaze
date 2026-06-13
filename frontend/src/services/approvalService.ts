import { apiClient } from "@/lib/apiClient";

export type ShippingRateApproval = {
  id: string;
  type: "courier" | "rate_card" | "dropshipper_override";
  courierName?: string | null;
  dropshipperUserId?: string | null;
  previousValues: Record<string, unknown>;
  pendingValues: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  submittedBy?: string | null;
  submittedByRole?: string;
  submittedByName?: string;
  reviewedBy?: string | null;
  reviewedAt?: string;
  rejectedReason?: string;
  createdAt?: string;
};

export type ProductPriceApproval = {
  id: string;
  productId: string;
  productName: string;
  productSku?: string;
  previousPrice: number;
  previousSellingPrice: number;
  previousShippingCharge: number;
  pendingPrice: number;
  pendingSellingPrice: number;
  pendingShippingCharge: number;
  status: "pending" | "approved" | "rejected";
  reason?: string;
  submittedBy?: string | null;
  submittedByRole?: string;
  submittedByName?: string;
  reviewedBy?: string | null;
  reviewedAt?: string;
  rejectedReason?: string;
  createdAt?: string;
};

export type RateCardData = {
  paymentType: "COD" | "Prepaid";
  zones: string[];
  weights: string[];
  rates: number[][];
  readOnly?: boolean;
  updatedAt?: string | null;
};

export async function getShippingRateCard(paymentType: "COD" | "Prepaid" = "Prepaid") {
  return apiClient.get<RateCardData>(`/shipping-rate-card?paymentType=${paymentType}`);
}

export async function adminSaveShippingRateCard(data: Omit<RateCardData, "readOnly">) {
  return apiClient.post<RateCardData>("/admin/shipping-rate-card", data);
}

export async function adminUpsertCourierDirect(body: Record<string, unknown>) {
  return apiClient.post<unknown>("/admin/couriers/direct", body);
}

export async function submitShippingRateChange(body: Record<string, unknown>) {
  return apiClient.post<ShippingRateApproval>("/shipping-rate-change-requests", body);
}

export async function listShippingRateApprovals(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiClient.get<ShippingRateApproval[]>(`/shipping-rate-approvals${q}`);
}

export async function listProductPriceApprovals(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiClient.get<ProductPriceApproval[]>(`/product-price-approvals${q}`);
}

export async function approveShippingRate(id: string) {
  return apiClient.patch<ShippingRateApproval>(`/admin/shipping-rate-approvals/${encodeURIComponent(id)}/approve`, {});
}

export async function rejectShippingRate(id: string, reason: string) {
  return apiClient.patch<ShippingRateApproval>(
    `/admin/shipping-rate-approvals/${encodeURIComponent(id)}/reject`,
    { reason }
  );
}

export async function approveProductPrice(id: string) {
  return apiClient.patch<ProductPriceApproval>(`/admin/product-price-approvals/${encodeURIComponent(id)}/approve`, {});
}

export async function rejectProductPrice(id: string, reason: string) {
  return apiClient.patch<ProductPriceApproval>(
    `/admin/product-price-approvals/${encodeURIComponent(id)}/reject`,
    { reason }
  );
}

export type DropshipperCourierRate = {
  courierName: string;
  carrierId?: string;
  surfaceRate?: number;
  airRate?: number;
  codRate?: number;
  enabled?: boolean;
};

export type DropshipperShippingRatesResponse = {
  dropshipper: { id: string; name: string; email: string };
  override: {
    shippingCharge: number;
    surfaceRate?: number;
    airRate?: number;
    courierRates: DropshipperCourierRate[];
    notes?: string;
    updatedAt?: string | null;
  };
  availableCouriers: Array<{ name: string; surfaceRate?: number; airRate?: number }>;
};

export async function getDropshipperShippingRates(userId: string) {
  return apiClient.get<DropshipperShippingRatesResponse>(`/admin/dropshipper-shipping-rates/${encodeURIComponent(userId)}`);
}

export async function saveDropshipperShippingRates(userId: string, body: Record<string, unknown>) {
  return apiClient.put<DropshipperShippingRatesResponse["override"]>(`/admin/dropshipper-shipping-rates/${encodeURIComponent(userId)}`, body);
}

export function finalPrice(price: number, shipping: number) {
  return price + shipping;
}

export function fmtInr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
