import type { Order } from "@/types/logistics";

/** Amazon Transportation / Amazon Shipping — official label comes from Velocity as a courier PDF. */
export function isAmazonTransportationOrder(order: Pick<Order, "courier" | "courierName">): boolean {
  const name = `${order.courierName ?? ""} ${order.courier ?? ""}`.toLowerCase();
  return name.includes("amazon");
}

/**
 * Amazon / Velocity courier PDFs (official Amazon shipping label).
 * Prefer when we have an AWB or a stored label URL — never invent ShipAmaze HTML for Amazon.
 */
export function shouldUseVelocityCourierPdf(order: Order): boolean {
  if (!isAmazonTransportationOrder(order)) return false;
  const hasAwb = Boolean(String(order.awb ?? order.trackingId ?? "").trim());
  const hasLabelUrl = Boolean(String(order.labelUrl ?? "").trim());
  return hasAwb || hasLabelUrl;
}
