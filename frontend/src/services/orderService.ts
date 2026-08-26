import { apiClient, downloadAuthenticatedFile } from "@/lib/apiClient";
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
  /** Which event timestamp dateFrom/dateTo (and timeline display) use. omit / choose = tab default */
  dateType?: "choose" | "placed" | "pickup" | "delivered";
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
  dropshipperId?: string;
  vendorId?: string;
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
  /** Return tab badge counts only — skip the order list aggregation. */
  countsOnly?: boolean;
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
  if (params.dateType && params.dateType !== "choose") {
    setIfTrim(sp, "dateType", params.dateType);
  }
  if (params.tab) sp.set("tab", params.tab);
  if (params.counts) sp.set("counts", "1");
  if (params.countsOnly) sp.set("countsOnly", "1");
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
  setIfTrim(sp, "dropshipperId", params.dropshipperId);
  setIfTrim(sp, "vendorId", params.vendorId);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Paginated list (default). Use legacy: true for raw Order[] during migration. */
export async function listOrders(
  params: ListOrdersParams = {},
  init?: { signal?: AbortSignal }
): Promise<OrdersListMeta | Order[]> {
  const qs = buildQueryString(params);
  if (params.legacy) {
    return apiClient.get<Order[]>(`/orders${qs}`, { signal: init?.signal });
  }
  return apiClient.get<OrdersListMeta>(`/orders${qs}`, { signal: init?.signal });
}

/** Full order rows for selected IDs (bulk labels/invoices across pages). */
export async function getOrdersByIds(orderIds: string[]): Promise<Order[]> {
  const ids = [...new Set(orderIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length === 0) return [];
  const res = await apiClient.post<{ orders: Order[] }>("/orders/by-ids", { orderIds: ids });
  return res.orders ?? [];
}

/** IDs matching list filters (for select-all / bulk process up to 1000). */
export async function listOrderIds(params: ListOrdersParams & { limit?: number } = {}) {
  const qs = buildQueryString(params);
  const sp = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
  if (params.limit != null) sp.set("limit", String(params.limit));
  const s = sp.toString();
  return apiClient.get<{ ids: string[]; total: number; capped: boolean; limit: number }>(
    `/orders/ids${s ? `?${s}` : ""}`
  );
}

/** Download CSV for all orders matching filters (not limited to current page). */
export async function exportOrdersCsv(params: ListOrdersParams = {}) {
  const qs = buildQueryString({ ...params, counts: false });
  const fallback = `shipamaze-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  await downloadAuthenticatedFile(`/orders/export.csv${qs}`, fallback);
}

/** Download CSV for specific order IDs. */
export async function exportOrdersCsvByIds(orderIds: string[]) {
  const fallback = `shipamaze-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  await downloadAuthenticatedFile("/orders/export.csv", fallback, {
    method: "POST",
    json: { orderIds },
  });
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

export type OrderUpdateResult = Order & {
  velocitySync?: { synced: boolean; reason?: string };
};

export async function updateOrder(orderId: string, body: Record<string, unknown>) {
  return apiClient.put<OrderUpdateResult>(`/orders/${encodeURIComponent(orderId)}`, body);
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
  /** Local Mongo pickup/warehouse id — backend resolves live Velocity warehouse_id from Pickup.velocityWarehouseId */
  warehouseId: string;
  /** @deprecated Prefer warehouseId; backend resolves live link. Kept for direct API callers only. */
  velocityWarehouseId?: string;
  /** Empty string = Velocity auto-assign */
  carrier_id?: string | number | "";
  courier_name?: string;
  /** velocity (default) | lorrigo | ekart (direct Durin — not Velocity’s Ekart carrier) */
  provider?: "velocity" | "lorrigo" | "ekart";
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
}) {
  const provider =
    body.provider === "lorrigo" ? "lorrigo" : body.provider === "ekart" ? "ekart" : "velocity";

  // Direct Lorrigo / Ekart (Durin) — never route these to Velocity.
  if (provider === "lorrigo" || provider === "ekart") {
    return apiClient.post<{
      success: boolean;
      data: {
        order_id: string;
        shipment_id?: string;
        awb_code: string;
        carrier_name?: string;
        label_url?: string;
        shipping_charges?: number;
        status?: string;
        provider?: string;
      };
      orderId?: string;
    }>("/courier/shipments", {
      orderId: body.orderId,
      warehouseId: body.warehouseId,
      provider,
      carrier_id: body.carrier_id,
      courier_name: body.courier_name,
      weight: body.weight,
      length: body.length,
      width: body.width,
      height: body.height,
    });
  }

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

export async function deleteJunkOrder(id: string) {
  return apiClient.delete<{ success: true; message: string; orderId: string }>(
    `/orders/${encodeURIComponent(id)}`
  );
}

export async function bulkDeleteJunkOrders(orderIds: string[]) {
  return apiClient.post<{ success: true; deletedCount: number; orderIds: string[] }>(
    "/orders/bulk-delete-junk",
    { orderIds }
  );
}

export async function moveOrderToReship(id: string) {
  return apiClient.post<{
    success: true;
    message: string;
    providerCancel?: {
      attempted: boolean;
      success: boolean;
      provider: "velocity" | "lorrigo";
      message?: string;
    };
  }>(`/orders/${encodeURIComponent(id)}/reship`, {});
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
  courierSelectionMode: "priority" | "courier";
  courierName: string;
  carrierId?: string;
  /** velocity (default) | lorrigo | ekart */
  provider?: "velocity" | "lorrigo" | "ekart";
  shipmentMode: "forward" | "reverse";
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
};

export type ProcessSelectedResult = {
  success: boolean;
  updatedCount: number;
  updated: { orderId: string; awb: string; carrier?: string }[];
  failed: { orderId: string; error: string }[];
  skipped: { orderId: string; reason: string }[];
  total: number;
  /** Non-fatal pickup → courier sync issues for this batch's pickup address (e.g. Velocity/Lorrigo link failed). */
  pickupLinkWarnings?: { provider: "velocity" | "lorrigo"; error: string }[];
};

export async function processSelectedOrders(payload: ProcessSelectedPayload) {
  return apiClient.post<ProcessSelectedResult>("/orders/process-selected", payload);
}

const PROCESS_SELECTED_BATCH_SIZE = 25;
/** Run a few HTTP batches in parallel to cut wall-clock time for large selections. */
const PROCESS_SELECTED_PARALLEL_BATCHES = 2;

/** Process large selections in batches to avoid gateway timeouts and show progress. */
export async function processSelectedOrdersBatched(
  payload: ProcessSelectedPayload,
  onProgress?: (done: number, total: number) => void
): Promise<ProcessSelectedResult> {
  const allIds = [...new Set(payload.orderIds.map((id) => String(id).trim()).filter(Boolean))];
  if (allIds.length === 0) {
    return { success: true, updatedCount: 0, updated: [], failed: [], skipped: [], total: 0 };
  }

  const aggregated: ProcessSelectedResult = {
    success: true,
    updatedCount: 0,
    updated: [],
    failed: [],
    skipped: [],
    total: allIds.length,
    pickupLinkWarnings: [],
  };

  const batches: string[][] = [];
  for (let i = 0; i < allIds.length; i += PROCESS_SELECTED_BATCH_SIZE) {
    batches.push(allIds.slice(i, i + PROCESS_SELECTED_BATCH_SIZE));
  }

  let processed = 0;
  for (let i = 0; i < batches.length; i += PROCESS_SELECTED_PARALLEL_BATCHES) {
    const wave = batches.slice(i, i + PROCESS_SELECTED_PARALLEL_BATCHES);
    const results = await Promise.all(
      wave.map((batchIds) => processSelectedOrders({ ...payload, orderIds: batchIds }))
    );
    for (const res of results) {
      aggregated.updated.push(...res.updated);
      aggregated.failed.push(...res.failed);
      aggregated.skipped.push(...res.skipped);
      aggregated.updatedCount += res.updatedCount;
      if (res.failed.length > 0) aggregated.success = false;
      for (const w of res.pickupLinkWarnings ?? []) {
        if (!aggregated.pickupLinkWarnings!.some((x) => x.provider === w.provider && x.error === w.error)) {
          aggregated.pickupLinkWarnings!.push(w);
        }
      }
    }
    processed += wave.reduce((n, b) => n + b.length, 0);
    onProgress?.(Math.min(processed, allIds.length), allIds.length);
  }

  return aggregated;
}
