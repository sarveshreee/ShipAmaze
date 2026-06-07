import { apiClient } from "@/lib/apiClient";

export type CatalogueProductRow = {
  _id: string;
  id: string;
  name: string;
  sku?: string;
  category?: string;
  price?: number;
  sellingPrice?: number;
  shippingCharge?: number;
  finalPrice?: number;
  stock?: number;
  status?: string;
  vendorId?: string | null;
  vendorName?: string;
  uploadedBy?: string | null;
  uploadedByRole?: string;
  images?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type Paginated<T> = { items: T[]; total: number; page: number; limit: number };

const enc = encodeURIComponent;

export function adminListCatalogue(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, v);
  }
  return apiClient.get<Paginated<CatalogueProductRow>>(`/admin/catalogue/products?${q.toString()}`);
}

export function adminPatchCatalogueProduct(id: string, body: Record<string, unknown>) {
  return apiClient.patch<CatalogueProductRow>(`/admin/catalogue/products/${enc(id)}`, body);
}

export function adminBulkCatalogue(ids: string[], action: string) {
  return apiClient.post<{ ok: boolean; modified: number }>("/admin/catalogue/products/bulk", { ids, action });
}

export type AdminVendorRow = {
  id: string;
  userId: string;
  name: string;
  city: string;
  pin: string;
  vendorStatus: string;
  accountName?: string;
  companyName?: string;
  accountStatus?: string;
  phone?: string;
  email?: string;
  walletBalance: number;
  orderCount: number;
  shipmentCount: number;
  shopify: { connected: boolean; shopDomain?: string; lastSyncedAt?: string; syncCount?: number };
};

export function adminListVendors(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, v);
  }
  return apiClient.get<Paginated<AdminVendorRow>>(`/admin/vendors?${q.toString()}`);
}

export function adminGetVendor(id: string) {
  return apiClient.get<Record<string, unknown>>(`/admin/vendors/${enc(id)}`);
}

export function adminPatchVendor(id: string, body: { vendorStatus?: string; userStatus?: string }) {
  return apiClient.patch<{ ok: boolean }>(`/admin/vendors/${enc(id)}`, body);
}

export type AdminDropshipperRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  companyName?: string;
  accessType?: "FULL" | "RESTRICTED";
  allowWarehouseAccess?: boolean;
  accountStatus?: string;
  totalOrders: number;
  activeOrders: number;
  kycVerified?: boolean;
  walletBalance: number;
  orderCount: number;
  shipmentCount: number;
  joinDate?: string;
  shopify: { connected: boolean; shopDomain?: string; lastSyncedAt?: string };
};

export function adminListDropshippers(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, v);
  }
  return apiClient.get<Paginated<AdminDropshipperRow>>(`/admin/dropshippers?${q.toString()}`);
}

export function adminGetDropshipper(id: string) {
  return apiClient.get<Record<string, unknown>>(`/admin/dropshippers/${enc(id)}`);
}

export function adminPatchDropshipper(
  id: string,
  body: { userStatus?: string; accessType?: "FULL" | "RESTRICTED"; allowWarehouseAccess?: boolean }
) {
  return apiClient.patch<{ ok: boolean }>(`/admin/dropshippers/${enc(id)}`, body);
}

export type SupportTicketListItem = {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  requester: { name?: string; email?: string; role?: string };
  assigneeUserId: string | null;
  createdAt: string;
};

export function adminListSupportTickets(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, v);
  }
  return apiClient.get<Paginated<SupportTicketListItem>>(`/admin/support/tickets?${q.toString()}`);
}

export function adminGetSupportTicket(id: string) {
  return apiClient.get<Record<string, unknown>>(`/admin/support/tickets/${enc(id)}`);
}

export function adminPatchSupportTicket(
  id: string,
  body: { status?: string; priority?: string; assigneeUserId?: string | null }
) {
  return apiClient.patch<{ ok: boolean }>(`/admin/support/tickets/${enc(id)}`, body);
}

export function adminAddSupportTicketComment(id: string, body: string, isInternal?: boolean) {
  return apiClient.post<{ ok: boolean }>(`/admin/support/tickets/${enc(id)}/comments`, { body, isInternal });
}

export function userCreateSupportTicket(title: string, description: string, priority?: string) {
  return apiClient.post<{ id: string; ticketNumber: string; status: string }>("/support/tickets", {
    title,
    description,
    priority,
  });
}

export type AdminUserBrief = { id: string; name: string; email: string };

export function adminListAdminUsers() {
  return apiClient.get<AdminUserBrief[]>("/admin/staff/admins");
}
