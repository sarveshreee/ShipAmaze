/** Safe public tracking payload from GET /orders/public/:id and GET /orders/track/:awb */

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
