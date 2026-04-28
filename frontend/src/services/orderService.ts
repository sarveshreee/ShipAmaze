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

export async function trackByAwb(awb: string) {
  return apiClient.get<Order>(`/orders/track/${encodeURIComponent(awb)}`);
}

export async function getPublicOrder(orderId: string) {
  return apiClient.get<Order>(`/orders/public/${encodeURIComponent(orderId)}`);
}

export async function createShipment(body: { orderId: string; courierId: string; warehouseId: string }) {
  return apiClient.post<{ success: true; trackingId: string; shipmentId: string }>("/orders/create-shipment", body);
}

export async function moveOrderToJunk(id: string, junkReason?: string) {
  return apiClient.post<{ success: true; message: string }>(`/orders/${encodeURIComponent(id)}/junk`, {
    junkReason,
  });
}
