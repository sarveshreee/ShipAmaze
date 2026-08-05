/**
 * Provider event timeline helpers — append-only history for production debugging.
 */

import type { CourierProviderId } from "./types.js";
import type { IOrder, IProviderEvent } from "../../models/Order.js";

export type ProviderEventType =
  | "BOOKING_REQUEST"
  | "BOOKING_RESPONSE"
  | "BOOKING_FAILED"
  | "TRACKING_SYNC"
  | "TRACKING_FAILED"
  | "STATUS_CHANGE"
  | "CANCEL_REQUEST"
  | "CANCEL_RESPONSE"
  | "RECONCILIATION"
  | "NDR_RECEIVED"
  | "NDR_ACTION"
  | "NDR_RESOLVED"
  | "WEBHOOK_RECEIVED";

export type ProviderEventStatus = "SUCCESS" | "FAILED" | "SKIPPED" | "PENDING";

const MAX_PROVIDER_EVENTS = 100;

export function appendProviderEvent(
  order: IOrder,
  event: {
    provider: CourierProviderId;
    type: ProviderEventType;
    status?: ProviderEventStatus;
    durationMs?: number;
    message?: string;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  }
): void {
  const entry: IProviderEvent = {
    provider: event.provider,
    type: event.type,
    timestamp: new Date(),
    status: event.status,
    durationMs: event.durationMs,
    message: event.message,
    correlationId: event.correlationId ?? order.correlationId,
    metadata: event.metadata,
  };
  const prev = order.providerEvents ?? [];
  order.providerEvents = [...prev, entry].slice(-MAX_PROVIDER_EVENTS);
  if (typeof order.markModified === "function") {
    order.markModified("providerEvents");
  }
}
