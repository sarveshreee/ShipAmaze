import { apiClient } from "@/lib/apiClient";
import type { Order } from "@/types/logistics";

export async function listOrders() {
  return apiClient.get<Order[]>("/orders");
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
