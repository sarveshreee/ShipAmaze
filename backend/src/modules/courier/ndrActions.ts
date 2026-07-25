/**
 * Provider-agnostic NDR action helpers — controllers use these, not provider modules.
 */

import { AppError } from "../../middleware/errorMiddleware.js";
import type { CourierProviderId, ProviderNdrActionType } from "./types.js";

/** Actions each provider exposes to the UI/API. */
export function supportedNdrActions(providerId: CourierProviderId): ProviderNdrActionType[] {
  if (providerId === "lorrigo") return ["reattempt", "return", "fake-attempt"];
  return ["reattempt", "return"];
}

/**
 * Normalize client action strings into the shared ProviderNdrActionType.
 * Accepts legacy Velocity aliases (`rto`, `force_rto`) as `return`.
 */
export function normalizeProviderNdrAction(
  input: unknown,
  providerId: CourierProviderId
): ProviderNdrActionType {
  const raw = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

  let action: ProviderNdrActionType | null = null;
  if (["reattempt", "re_attempt", "reattempt_delivery", "re_attempt_delivery"].includes(raw)) {
    action = "reattempt";
  } else if (["rto", "force_rto", "return_to_origin", "return"].includes(raw)) {
    action = "return";
  } else if (["fake_attempt", "fakeattempt"].includes(raw)) {
    action = "fake-attempt";
  }

  if (!action) {
    throw new AppError(
      400,
      "action must be reattempt, return (or rto), or fake-attempt (when supported)"
    );
  }

  const allowed = supportedNdrActions(providerId);
  if (!allowed.includes(action)) {
    throw new AppError(400, `${action} is not supported for ${providerId}`);
  }
  return action;
}

export function resolveNdrProviderId(
  courierProvider: unknown
): CourierProviderId {
  return courierProvider === "lorrigo" ? "lorrigo" : "velocity";
}
