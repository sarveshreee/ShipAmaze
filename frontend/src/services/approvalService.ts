import { apiClient } from "@/lib/apiClient";
import { assertDropshipperUserId } from "@/lib/dropshipperUserId";

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
  courierZoneRows?: CourierZoneRowPayload[];
  enterpriseRows?: EnterpriseRateRowPayload[];
};

export type CourierZoneRowPayload = {
  courier: string;
  zone: string;
  rates: number[];
  codCharge: number;
  active: boolean;
};

export type EnterpriseRateRowPayload = {
  courier: string;
  type: "FWD" | "RTO" | "REV";
  slab: "Base" | "Additional";
  zoneRates: number[];
  active: boolean;
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

export type DropshipperShippingRatesResponse = {
  dropshipper: { userId: string; name: string; email: string };
  paymentType: "COD" | "Prepaid";
  courierZoneRows: CourierZoneRowPayload[];
  masterCourierZoneRows?: CourierZoneRowPayload[];
  hasOverride?: boolean;
  updatedAt?: string | null;
  override?: {
    prepaidCourierZoneRows?: CourierZoneRowPayload[];
    codCourierZoneRows?: CourierZoneRowPayload[];
    updatedAt?: string | null;
  };
};

export async function getDropshipperShippingRates(userId: string, paymentType: "COD" | "Prepaid" = "Prepaid") {
  const canonicalUserId = assertDropshipperUserId(userId);
  return apiClient.get<DropshipperShippingRatesResponse>(
    `/admin/dropshipper-shipping-rates/${encodeURIComponent(canonicalUserId)}?paymentType=${paymentType}`
  );
}

export async function saveDropshipperShippingRates(
  userId: string,
  body: {
    paymentType: "COD" | "Prepaid";
    courierZoneRows: CourierZoneRowPayload[];
  }
) {
  const canonicalUserId = assertDropshipperUserId(userId);
  return apiClient.put<{ paymentType: "COD" | "Prepaid"; courierZoneRows: CourierZoneRowPayload[]; hasOverride: boolean }>(
    `/admin/dropshipper-shipping-rates/${encodeURIComponent(canonicalUserId)}`,
    body
  );
}

export function finalPrice(price: number, shipping: number) {
  return price + shipping;
}

export function fmtInr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
