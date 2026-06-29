import type { Order } from "@/types/logistics";

/** Amazon Transportation / Amazon Shipping — official label comes from Velocity as a courier PDF. */
export function isAmazonTransportationOrder(order: Pick<Order, "courier" | "courierName">): boolean {
  const name = `${order.courierName ?? ""} ${order.courier ?? ""}`.toLowerCase();
  return name.includes("amazon");
}

/** Only Amazon orders with an AWB use the Velocity courier PDF proxy. All others use the ShipAmaze HTML label design. */
export function shouldUseVelocityCourierPdf(order: Order): boolean {
  return isAmazonTransportationOrder(order) && Boolean(String(order.awb ?? order.trackingId ?? "").trim());
}
