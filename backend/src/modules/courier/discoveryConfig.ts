/**
 * Courier discovery configuration (provider selection + optional cache TTL).
 */

import type { CourierDiscoveryMode, CourierProviderId } from "./types.js";
import { isLorrigoEnabledFlag } from "../lorrigo/lorrigo.config.js";
import { isEkartEnabledFlag } from "../ekart/ekart.config.js";
import { isVelocityEnabledFlag } from "../../config/env.js";

function intEnv(name: string, fallback: number): number {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseMode(raw: string | undefined): CourierDiscoveryMode | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "lorrigo") return "lorrigo";
  if (v === "ekart") return "ekart";
  if (v === "velocity") return "velocity";
  if (v === "both" || v === "all") return "both";
  // Comma lists / mixed → query all flagged providers
  if (v.includes(",") || v.includes("lorrigo") || v.includes("ekart") || v.includes("velocity")) {
    return "both";
  }
  return "velocity";
}

export const discoveryConfig = {
  /**
   * velocity | lorrigo | ekart | both
   * When unset: "both" if Lorrigo or Ekart is enabled, otherwise "velocity".
   */
  get mode(): CourierDiscoveryMode {
    const explicit = parseMode(process.env.COURIER_DISCOVERY_MODE);
    if (explicit) return explicit;
    return isLorrigoEnabledFlag() || isEkartEnabledFlag() ? "both" : "velocity";
  },

  /** 0 disables cross-request cache. Default 60s. */
  get cacheTtlSeconds(): number {
    return intEnv("COURIER_SERVICEABILITY_CACHE_TTL_SECONDS", 60);
  },

  get cacheEnabled(): boolean {
    return this.cacheTtlSeconds > 0;
  },
};

/** Resolve which providers to query for discovery (respects feature flags). */
export function resolveDiscoveryProviderIds(
  mode: CourierDiscoveryMode = discoveryConfig.mode
): CourierProviderId[] {
  const velocityOk = isVelocityEnabledFlag();
  const lorrigoOk = isLorrigoEnabledFlag();
  const ekartOk = isEkartEnabledFlag();
  if (mode === "velocity") return velocityOk ? ["velocity"] : [];
  if (mode === "lorrigo") return lorrigoOk ? ["lorrigo"] : [];
  if (mode === "ekart") return ekartOk ? ["ekart"] : [];
  const ids: CourierProviderId[] = [];
  if (velocityOk) ids.push("velocity");
  if (lorrigoOk) ids.push("lorrigo");
  if (ekartOk) ids.push("ekart");
  return ids;
}
