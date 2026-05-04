import type { Order } from "@/types/logistics";

/** Digits-only pin (max 6) for India destination checks. */
export function deliveryPinDigits(pc: string | undefined): string {
  return String(pc ?? "").replace(/\D/g, "").slice(0, 6);
}

function parseOrderWeightKg(weight: string | undefined): number {
  const m = String(weight ?? "").match(/[\d.]+/);
  return m ? Number.parseFloat(m[0]) : 0;
}

/** First `LxWxH` segment in `dimensions` (e.g. `10x10x10 cm; ...`). */
function parseOrderBoxCm(dimensions: string | undefined): { l: number; w: number; h: number } | null {
  if (!dimensions?.trim()) return null;
  const first = dimensions.split(";")[0].trim().replace(/cm/gi, "");
  const parts = first.split(/x/i).map((s) => Number.parseFloat(s.trim()));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return { l: parts[0], w: parts[1], h: parts[2] };
}

/** Reasons we should not call Velocity until the order is fixed (mirrors backend validation). */
export function forwardShipmentBlockers(o: Order): string[] {
  const issues: string[] = [];
  if (deliveryPinDigits(o.pincode).length !== 6) {
    issues.push("Customer delivery pincode must be 6 digits.");
  }
  if (!String(o.phone ?? "").trim()) issues.push("Customer phone is missing.");
  if (!String(o.address ?? "").trim()) issues.push("Delivery address is missing.");
  if (!String(o.city ?? "").trim()) issues.push("City is missing.");
  if (!String(o.state ?? "").trim()) issues.push("State is missing.");
  if (!String(o.customer ?? "").trim()) issues.push("Customer name is missing.");
  const namedProducts = (o.products || []).filter((p) => String(p.name ?? "").trim());
  if (!namedProducts.length) issues.push("Add at least one order line with a product name.");
  if (parseOrderWeightKg(o.weight) <= 0) issues.push("Package weight must be greater than zero.");
  const box = parseOrderBoxCm(o.dimensions);
  if (!String(o.dimensions ?? "").trim()) {
    issues.push("Package dimensions are missing (e.g. length × width × height in cm).");
  } else if (!box || box.l <= 0 || box.w <= 0 || box.h <= 0) {
    issues.push("Package dimensions look invalid. Use values like 10x10x10 cm.");
  }
  return issues;
}
