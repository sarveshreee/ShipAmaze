/**
 * Process-lifetime metrics for courier discovery (serviceability / rates).
 */

export interface DiscoveryMetricsSnapshot {
  apiCalls: number;
  cacheHits: number;
  cacheMisses: number;
  providerFailures: number;
  providerTimeouts: number;
  couriersReturned: number;
  lastLatencyMs: number | null;
}

const state: DiscoveryMetricsSnapshot = {
  apiCalls: 0,
  cacheHits: 0,
  cacheMisses: 0,
  providerFailures: 0,
  providerTimeouts: 0,
  couriersReturned: 0,
  lastLatencyMs: null,
};

export function recordDiscoveryCall(opts: {
  latencyMs: number;
  cacheHits: number;
  cacheMisses: number;
  providerFailures: number;
  providerTimeouts: number;
  courierCount: number;
}): void {
  state.apiCalls += 1;
  state.cacheHits += opts.cacheHits;
  state.cacheMisses += opts.cacheMisses;
  state.providerFailures += opts.providerFailures;
  state.providerTimeouts += opts.providerTimeouts;
  state.couriersReturned += opts.courierCount;
  state.lastLatencyMs = opts.latencyMs;
}

export function getDiscoveryMetricsSnapshot(): DiscoveryMetricsSnapshot & {
  cacheHitRatio: number | null;
} {
  const total = state.cacheHits + state.cacheMisses;
  return {
    ...state,
    cacheHitRatio: total > 0 ? state.cacheHits / total : null,
  };
}

export function resetDiscoveryMetricsForTests(): void {
  state.apiCalls = 0;
  state.cacheHits = 0;
  state.cacheMisses = 0;
  state.providerFailures = 0;
  state.providerTimeouts = 0;
  state.couriersReturned = 0;
  state.lastLatencyMs = null;
}
