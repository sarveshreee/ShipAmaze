import { apiClient } from "@/lib/apiClient";
import type { Order } from "@/types/logistics";
import type { PublicTrackingOrder } from "@/types/publicTracking";

export type OrdersListMeta = {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
  tabCounts?: Record<string, number>;
};

/** Advanced list filters (query string fields for GET /orders). */
export type OrderListFilterValues = {
  status?: string;
  payment?: string;
  courier?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  customerCity?: string;
  customerState?: string;
  pickupCity?: string;
  pickupState?: string;
  productSku?: string;
  productName?: string;
  amountMin?: string;
  amountMax?: string;
  hasAwb?: string;
  shipmentCreated?: string;
};

export type ListOrdersParams = OrderListFilterValues & {
  view?: "junk";
  page?: number;
  pageSize?: number;
  q?: string;
  /** Shopify fulfillment_status (e.g. fulfilled, partial) when filtering channel orders */
  fulfillment?: string;
  tab?: string;
  counts?: boolean;
  /** Use legacy array-only response from API */
  legacy?: boolean;
};

function setIfTrim(sp: URLSearchParams, key: string, v: string | undefined) {
  const t = v?.trim();
  if (t) sp.set(key, t);
}

function buildQueryString(params: ListOrdersParams): string {
  const sp = new URLSearchParams();
  if (params.view) sp.set("view", params.view);
  if (params.legacy) sp.set("legacy", "1");
  if (params.page != null) sp.set("page", String(params.page));
  if (params.pageSize != null) sp.set("pageSize", String(params.pageSize));
  if (params.q) sp.set("q", params.q);
  setIfTrim(sp, "status", params.status);
  setIfTrim(sp, "payment", params.payment);
  setIfTrim(sp, "courier", params.courier);
  setIfTrim(sp, "source", params.source);
  if (params.fulfillment) sp.set("fulfillment", params.fulfillment);
  setIfTrim(sp, "dateFrom", params.dateFrom);
  setIfTrim(sp, "dateTo", params.dateTo);
  if (params.tab) sp.set("tab", params.tab);
  if (params.counts) sp.set("counts", "1");
  setIfTrim(sp, "customerCity", params.customerCity);
  setIfTrim(sp, "customerState", params.customerState);
  setIfTrim(sp, "pickupCity", params.pickupCity);
  setIfTrim(sp, "pickupState", params.pickupState);
  setIfTrim(sp, "productSku", params.productSku);
  setIfTrim(sp, "productName", params.productName);
  setIfTrim(sp, "amountMin", params.amountMin);
  setIfTrim(sp, "amountMax", params.amountMax);
  setIfTrim(sp, "hasAwb", params.hasAwb);
  setIfTrim(sp, "shipmentCreated", params.shipmentCreated);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Paginated list (default). Use legacy: true for raw Order[] during migration. */
export async function listOrders(params: ListOrdersParams = {}): Promise<OrdersListMeta | Order[]> {
  const qs = buildQueryString(params);
  if (params.legacy) {
    return apiClient.get<Order[]>(`/orders${qs}`);
  }
  return apiClient.get<OrdersListMeta>(`/orders${qs}`);
}

export async function getOrder(orderId: string) {
  return apiClient.get<Order>(`/orders/${encodeURIComponent(orderId)}`);
}

export async function createOrder(body: Record<string, unknown>) {
  return apiClient.post<Order>("/orders", body);
}

export async function createOrdersBulk(orders: unknown[]) {
  return apiClient.post<{ created: number; orders: Order[] }>("/orders/bulk", { orders });
}

export async function updateOrderStatus(orderId: string, status: string) {
  return apiClient.patch<Order>(`/orders/${encodeURIComponent(orderId)}/status`, { status });
}

export async function updateOrder(orderId: string, body: Record<string, unknown>) {
  return apiClient.put<Order>(`/orders/${encodeURIComponent(orderId)}`, body);
}

export async function patchOrderLineItemSku(orderId: string, lineIndex: number, sku: string) {
  return apiClient.patch<{ order: Order; audit: Record<string, unknown> | null }>(
    `/orders/${encodeURIComponent(orderId)}/line-items/${lineIndex}/sku`,
    { sku }
  );
}

export async function listOrderSkuAudit(orderId: string) {
  return apiClient.get<{
    items: {
      id: string;
      lineIndex: number;
      oldSku: string;
      newSku: string;
      productName?: string;
      updatedByName?: string;
      createdAt: string;
    }[];
  }>(`/orders/${encodeURIComponent(orderId)}/sku-audit`);
}

export async function trackByAwb(awb: string) {
  return apiClient.get<PublicTrackingOrder>(`/orders/track/${encodeURIComponent(awb)}`);
}

export async function getPublicOrder(orderId: string) {
  return apiClient.get<PublicTrackingOrder>(`/orders/public/${encodeURIComponent(orderId)}`);
}

export type { PublicTrackingOrder } from "@/types/publicTracking";

export async function createShipment(body: {
  orderId: string;
  warehouseId: string;
  /** Linked Velocity warehouse code (e.g. WHBRR) from selected pickup */
  velocityWarehouseId?: string;
  /** Empty string = Velocity auto-assign */
  carrier_id?: string | number | "";
  courier_name?: string;
}) {
  return apiClient.post<{
    success: boolean;
    data: {
      order_id: string;
      shipment_id: string;
      awb_code: string;
      carrier_name: string;
      label_url?: string;
      manifest_url?: string;
      shipping_charges?: number;
      cod_charges?: number;
      rto_charges?: number;
      status: string;
    };
    orderId?: string;
  }>("/velocity/forward/create", {
    orderId: body.orderId,
    warehouseId: body.warehouseId,
    ...(body.velocityWarehouseId?.trim() ? { warehouse_id: body.velocityWarehouseId.trim() } : {}),
    ...(body.carrier_id === "" || body.carrier_id === undefined
      ? {}
      : { carrier_id: body.carrier_id }),
    ...(body.courier_name ? { courier_name: body.courier_name } : {}),
  });
}

export async function moveOrderToJunk(id: string, junkReason?: string) {
  return apiClient.post<{ success: true; message: string }>(`/orders/${encodeURIComponent(id)}/junk`, {
    junkReason,
  });
}

export async function bulkMoveOrders(orderIds: string[], targetStatus: "ready_to_ship") {
  return apiClient.post<{ success: true; updatedCount: number }>("/orders/bulk-move", {
    orderIds,
    targetStatus,
  });
}

export type ProcessSelectedPayload = {
  orderIds: string[];
  pickupAddressId: string;
  courierName: string;
  carrierId?: string;
  shipmentMode: "forward" | "reverse";
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
};

export async function processSelectedOrders(payload: ProcessSelectedPayload) {
  return apiClient.post<{ success: boolean; updatedCount: number; updated: { orderId: string; awb: string }[] }>(
    "/orders/process-selected",
    payload
  );
}
