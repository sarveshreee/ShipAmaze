/**
 * Safe DTO for unauthenticated order / AWB tracking (no PII beyond masked phone + city/state).
 */

export type PublicTrackingTimelineEntry = {
  date: string;
  activity: string;
  location: string;
};

export type PublicTrackingOrder = {
  id: string;
  awb: string;
  status: string;
  shipmentStatus?: string;
  courier: string;
  courierName?: string;
  customerPhoneMasked?: string;
  city?: string;
  state?: string;
  pincodeMasked?: string;
  payment?: string;
  date?: string;
  channel?: string;
  trackingUrl?: string;
  trackingActivities: PublicTrackingTimelineEntry[];
  estimatedDelivery?: string | null;
  pendingShipment?: boolean;
};

export function maskPhone(phone: string | undefined | null): string | undefined {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return undefined;
  return `******${digits.slice(-4)}`;
}

export function maskPincode(pincode: string | undefined | null): string | undefined {
  const p = String(pincode ?? "").replace(/\D/g, "");
  if (p.length < 4) return undefined;
  if (p.length <= 6) return `${p.slice(0, 2)}**${p.slice(-2)}`;
  return `${p.slice(0, 3)}***${p.slice(-2)}`;
}

/** Payment label without amount (e.g. "COD", "Prepaid"). */
export function publicPaymentLabel(payment: string | undefined | null): string | undefined {
  const raw = String(payment ?? "").trim();
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  if (upper.includes("COD")) return "COD";
  if (upper.includes("PREPAID") || upper.includes("PAID") || upper.includes("ONLINE")) return "Prepaid";
  return raw.split(/[₹(]/)[0]?.trim() || undefined;
}

type OrderLike = {
  orderId: string;
  awb?: string;
  status?: string;
  shipmentStatus?: string;
  courier?: string;
  courierName?: string;
  phone?: string;
  customerPhone?: string;
  city?: string;
  state?: string;
  shippingCity?: string;
  shippingState?: string;
  pincode?: string;
  shippingPincode?: string;
  payment?: string;
  date?: string;
  channel?: string;
  trackingUrl?: string;
  trackingActivities?: PublicTrackingTimelineEntry[];
  shipmentCreated?: boolean;
  trackingId?: string;
  statusHistory?: { status: string; at: Date; note?: string }[];
};

function buildTimeline(o: OrderLike): PublicTrackingTimelineEntry[] {
  if (Array.isArray(o.trackingActivities) && o.trackingActivities.length > 0) {
    return o.trackingActivities.map((a) => ({
      date: String(a.date ?? ""),
      activity: String(a.activity ?? "Update"),
      location: String(a.location ?? ""),
    }));
  }
  if (Array.isArray(o.statusHistory) && o.statusHistory.length > 0) {
    return o.statusHistory.map((h) => ({
      date: h.at instanceof Date ? h.at.toISOString() : String(h.at ?? ""),
      activity: String(h.status ?? "status"),
      location: h.note ? String(h.note) : "",
    }));
  }
  return [];
}

export function mapToPublicTracking(o: OrderLike): PublicTrackingOrder {
  const phoneRaw = o.customerPhone || o.phone;
  const city = o.shippingCity || o.city;
  const state = o.shippingState || o.state;
  const pin = o.shippingPincode || o.pincode;
  const awb = String(o.awb ?? "").trim();
  const hasShipment = Boolean(o.shipmentCreated) || awb.length > 0;

  return {
    id: o.orderId,
    awb,
    status: String(o.status ?? "pending"),
    shipmentStatus: o.shipmentStatus ? String(o.shipmentStatus) : undefined,
    courier: String(o.courierName || o.courier || ""),
    courierName: o.courierName ? String(o.courierName) : undefined,
    customerPhoneMasked: maskPhone(phoneRaw),
    city: city ? String(city) : undefined,
    state: state ? String(state) : undefined,
    pincodeMasked: maskPincode(pin),
    payment: publicPaymentLabel(o.payment),
    date: o.date ? String(o.date) : undefined,
    channel: o.channel ? String(o.channel) : undefined,
    trackingUrl: o.trackingUrl ? String(o.trackingUrl) : undefined,
    trackingActivities: buildTimeline(o),
    estimatedDelivery: null,
    pendingShipment: !hasShipment,
  };
}
