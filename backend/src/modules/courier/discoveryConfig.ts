/**
 * Courier discovery configuration (provider selection + optional cache TTL).
 */

import type { CourierDiscoveryMode, CourierProviderId } from "./types.js";
import { isLorrigoEnabledFlag } from "../lorrigo/lorrigo.config.js";

function intEnv(name: string, fallback: number): number {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseMode(raw: string | undefined): CourierDiscoveryMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "lorrigo") return "lorrigo";
  if (v === "both" || v === "all" || v === "velocity,lorrigo" || v === "lorrigo,velocity") {
    return "both";
  }
  return "velocity";
}

export const discoveryConfig = {
  /**
   * velocity | lorrigo | both
   * Default velocity keeps existing behavior until explicitly opted in.
   */
  get mode(): CourierDiscoveryMode {
    return parseMode(process.env.COURIER_DISCOVERY_MODE);
  },

  /** 0 disables cross-request cache. Default 60s. */
  get cacheTtlSeconds(): number {
    return intEnv("COURIER_SERVICEABILITY_CACHE_TTL_SECONDS", 60);
  },

  get cacheEnabled(): boolean {
    return this.cacheTtlSeconds > 0;
  },
};

/** Resolve which providers to query for discovery (respects LORRIGO_ENABLED). */
export function resolveDiscoveryProviderIds(
  mode: CourierDiscoveryMode = discoveryConfig.mode
): CourierProviderId[] {
  const lorrigoOk = isLorrigoEnabledFlag();
  if (mode === "velocity") return ["velocity"];
  if (mode === "lorrigo") return lorrigoOk ? ["lorrigo"] : [];
  // both
  const ids: CourierProviderId[] = ["velocity"];
  if (lorrigoOk) ids.push("lorrigo");
  return ids;
}
