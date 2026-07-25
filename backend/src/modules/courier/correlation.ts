import { randomUUID } from "crypto";

/** Generate a correlation id for booking → tracking → cancel → NDR → logs. */
export function newCorrelationId(): string {
  return randomUUID();
}

/** Ensure an order has a correlation id; returns the id. */
export function ensureCorrelationId(order: { correlationId?: string }): string {
  if (order.correlationId?.trim()) return order.correlationId.trim();
  const id = newCorrelationId();
  order.correlationId = id;
  return id;
}

/** Current booking payload version — bump when Lorrigo/Velocity payload shape changes. */
export const CURRENT_BOOKING_VERSION = 1;
