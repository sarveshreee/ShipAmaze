/**
 * Multi-provider courier discovery.
 * Controllers call this — never Lorrigo/Velocity modules directly for discovery.
 */

import { AppError } from "../../middleware/errorMiddleware.js";
import { providerPublicMessage } from "./http/providerErrors.js";
import { discoveryConfig, resolveDiscoveryProviderIds } from "./discoveryConfig.js";
import { recordDiscoveryCall } from "./discoveryMetrics.js";
import { finalizeCourierOption } from "./normalizeCourierOption.js";
import {
  listConfiguredCourierProviders,
  getCourierProvider,
} from "./providerRegistry.js";
import {
  buildServiceabilityCacheKey,
  getCachedCouriers,
  setCachedCouriers,
} from "./serviceabilityCache.js";
import type {
  CourierDiscoveryMode,
  CourierProviderId,
  ProviderCourierOption,
  ProviderDiscoveryInput,
  ProviderDiscoveryProviderResult,
  ProviderDiscoveryResult,
  ProviderPaymentMode,
} from "./types.js";

function normalizePin(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 6);
}

function assertValidPincode(label: string, pin: string): void {
  if (pin.length !== 6) {
    throw new AppError(400, `Invalid ${label} pincode (expected 6 digits)`);
  }
}

function assertValidDimensions(input: ProviderDiscoveryInput, requireWeight: boolean): void {
  if (requireWeight) {
    if (input.weightKg == null || !(Number(input.weightKg) > 0)) {
      throw new AppError(400, "weight (kg) is required and must be > 0");
    }
  }
  for (const [label, v] of [
    ["length", input.lengthCm],
    ["width", input.widthCm],
    ["height", input.heightCm],
  ] as const) {
    if (v != null && (!(Number(v) > 0) || !Number.isFinite(Number(v)))) {
      throw new AppError(400, `Invalid ${label} (must be a positive number)`);
    }
  }
  if (input.weightKg != null && (!(Number(input.weightKg) > 0) || !Number.isFinite(Number(input.weightKg)))) {
    throw new AppError(400, "Invalid weight (must be a positive number)");
  }
}

function isTimeoutError(err: unknown): boolean {
  if (err instanceof AppError && err.statusCode === 504) return true;
  const msg = providerPublicMessage(err).toLowerCase();
  return msg.includes("timed out") || msg.includes("timeout");
}

function applyDefaultPriority(couriers: ProviderCourierOption[]): ProviderCourierOption[] {
  // Stable ordering: Velocity first (existing default), then Lorrigo; within provider keep API order.
  const rank: Record<CourierProviderId, number> = { velocity: 0, lorrigo: 1000 };
  return couriers.map((c, index) => ({
    ...c,
    priorityScore: c.priorityScore ?? rank[c.provider] + index,
  }));
}

async function queryOneProvider(
  providerId: CourierProviderId,
  kind: "serviceability" | "rates",
  input: ProviderDiscoveryInput
): Promise<ProviderDiscoveryProviderResult & { couriers: ProviderCourierOption[] }> {
  const started = Date.now();
  const cacheKey = buildServiceabilityCacheKey({
    provider: providerId,
    kind,
    fromPincode: input.fromPincode,
    toPincode: input.toPincode,
    weightKg: input.weightKg,
    lengthCm: input.lengthCm,
    widthCm: input.widthCm,
    heightCm: input.heightCm,
    paymentMode: input.paymentMode,
  });

  const cached = getCachedCouriers(cacheKey);
  if (cached) {
    return {
      provider: providerId,
      ok: true,
      cacheHit: true,
      latencyMs: Date.now() - started,
      courierCount: cached.length,
      couriers: cached,
    };
  }

  try {
    const provider = getCourierProvider(providerId);
    if (!provider.isConfigured()) {
      return {
        provider: providerId,
        ok: false,
        cacheHit: false,
        latencyMs: Date.now() - started,
        courierCount: 0,
        couriers: [],
        error: `${provider.displayName} is not configured`,
      };
    }

    const raw =
      kind === "rates"
        ? await provider.getRates({
            fromPincode: input.fromPincode,
            toPincode: input.toPincode,
            weightKg: Number(input.weightKg),
            lengthCm: Number(input.lengthCm ?? 10),
            widthCm: Number(input.widthCm ?? 10),
            heightCm: Number(input.heightCm ?? 10),
            paymentMode: input.paymentMode,
            codValue: input.codValue ?? input.collectableAmount,
            shipmentType: input.shipmentType,
            qcApplicable: input.qcApplicable,
          })
        : await provider.serviceability({
            fromPincode: input.fromPincode,
            toPincode: input.toPincode,
            paymentMode: input.paymentMode,
            shipmentType: input.shipmentType,
            weightKg: input.weightKg,
            lengthCm: input.lengthCm,
            widthCm: input.widthCm,
            heightCm: input.heightCm,
            collectableAmount: input.collectableAmount ?? input.codValue,
          });

    const couriers = raw
      .map((c) => finalizeCourierOption(c))
      .filter((c): c is ProviderCourierOption => Boolean(c));

    setCachedCouriers(cacheKey, couriers);

    return {
      provider: providerId,
      ok: true,
      cacheHit: false,
      latencyMs: Date.now() - started,
      courierCount: couriers.length,
      couriers,
    };
  } catch (err) {
    const timedOut = isTimeoutError(err);
    return {
      provider: providerId,
      ok: false,
      cacheHit: false,
      latencyMs: Date.now() - started,
      courierCount: 0,
      couriers: [],
      error: providerPublicMessage(err),
      timedOut,
    };
  }
}

function prepareInput(raw: ProviderDiscoveryInput): ProviderDiscoveryInput {
  const fromPincode = normalizePin(raw.fromPincode);
  const toPincode = normalizePin(raw.toPincode);
  assertValidPincode("origin", fromPincode);
  assertValidPincode("destination", toPincode);
  const paymentMode = (raw.paymentMode === "cod" ? "cod" : "prepaid") as ProviderPaymentMode;
  return { ...raw, fromPincode, toPincode, paymentMode };
}

async function discover(
  kind: "serviceability" | "rates",
  raw: ProviderDiscoveryInput,
  opts?: { mode?: CourierDiscoveryMode }
): Promise<ProviderDiscoveryResult> {
  const totalStarted = Date.now();
  const input = prepareInput(raw);
  assertValidDimensions(input, kind === "rates");

  // Serviceability: default dims/weight for providers (e.g. Lorrigo) that require them.
  if (kind === "serviceability") {
    input.weightKg = input.weightKg != null && Number(input.weightKg) > 0 ? Number(input.weightKg) : 0.5;
    input.lengthCm = input.lengthCm != null && Number(input.lengthCm) > 0 ? Number(input.lengthCm) : 10;
    input.widthCm = input.widthCm != null && Number(input.widthCm) > 0 ? Number(input.widthCm) : 10;
    input.heightCm = input.heightCm != null && Number(input.heightCm) > 0 ? Number(input.heightCm) : 10;
  }

  const mode = opts?.mode ?? discoveryConfig.mode;
  const providerIds = resolveDiscoveryProviderIds(mode).filter((id) => {
    try {
      return getCourierProvider(id).isConfigured();
    } catch {
      return false;
    }
  });

  // If registry empty (tests), fall back to configured list check.
  if (providerIds.length === 0 && listConfiguredCourierProviders().length === 0) {
    // Still allow empty success when mode resolves to nothing (e.g. lorrigo-only + flag off).
  }

  const settled = await Promise.all(providerIds.map((id) => queryOneProvider(id, kind, input)));

  const couriers = applyDefaultPriority(settled.flatMap((s) => s.couriers));
  const cacheHits = settled.filter((s) => s.cacheHit).length;
  const cacheMisses = settled.filter((s) => !s.cacheHit && s.ok).length;
  const providerFailures = settled.filter((s) => !s.ok).length;
  const providerTimeouts = settled.filter((s) => s.timedOut).length;
  const totalLatencyMs = Date.now() - totalStarted;

  recordDiscoveryCall({
    latencyMs: totalLatencyMs,
    cacheHits,
    cacheMisses,
    providerFailures,
    providerTimeouts,
    courierCount: couriers.length,
  });

  console.info(
    `[courier:discovery] kind=${kind} mode=${mode} providers=${providerIds.join(",")} ` +
      `couriers=${couriers.length} cacheHits=${cacheHits} failures=${providerFailures} ` +
      `timeouts=${providerTimeouts} latencyMs=${totalLatencyMs}`
  );

  return {
    couriers,
    providers: settled.map(({ couriers: _c, ...rest }) => rest),
    metrics: {
      totalLatencyMs,
      cacheHits,
      cacheMisses,
      providerFailures,
      providerTimeouts,
      courierCount: couriers.length,
    },
  };
}

export async function discoverServiceability(
  input: ProviderDiscoveryInput,
  opts?: { mode?: CourierDiscoveryMode }
): Promise<ProviderDiscoveryResult> {
  return discover("serviceability", input, opts);
}

export async function discoverRates(
  input: ProviderDiscoveryInput,
  opts?: { mode?: CourierDiscoveryMode }
): Promise<ProviderDiscoveryResult> {
  return discover("rates", input, opts);
}
