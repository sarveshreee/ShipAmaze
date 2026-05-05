import { apiClient } from "@/lib/apiClient";
import type { Order } from "@/types/logistics";

export async function listOrders(view?: "junk") {
  const qs = view ? `?view=${encodeURIComponent(view)}` : "";
  return apiClient.get<Order[]>(`/orders${qs}`);
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

export async function trackByAwb(awb: string) {
  return apiClient.get<Order>(`/orders/track/${encodeURIComponent(awb)}`);
}

export async function getPublicOrder(orderId: string) {
  return apiClient.get<Order>(`/orders/public/${encodeURIComponent(orderId)}`);
}

export async function createShipment(body: {
  orderId: string;
  warehouseId: string;
  /** Empty string = Velocity auto-assign */
  carrier_id?: string | number | "";
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
    ...(body.carrier_id === "" || body.carrier_id === undefined
      ? {}
      : { carrier_id: body.carrier_id }),
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
