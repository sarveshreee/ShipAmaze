import type { Order } from "@/types/logistics";

/** Amazon Transportation / Amazon Shipping — official label comes from Velocity as a courier PDF. */
export function isAmazonTransportationOrder(order: Pick<Order, "courier" | "courierName">): boolean {
  const name = `${order.courierName ?? ""} ${order.courier ?? ""}`.toLowerCase();
  return name.includes("amazon");
}

/**
 * Amazon Transportation must ALWAYS use Velocity's official courier PDF — never ShipAmaze HTML.
 * Backend resolves cached PDF / labelUrl / Velocity refresh; missing label returns a clear error
 * instead of falling back to a generic invoice (which caused the recurring wrong-layout bug).
 */
export function shouldUseVelocityCourierPdf(order: Pick<Order, "courier" | "courierName">): boolean {
  return isAmazonTransportationOrder(order);
}
