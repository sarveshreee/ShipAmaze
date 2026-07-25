export interface LorrigoNdrMetricsSnapshot {
  ndrCount: number;
  fetchCalls: number;
  actionCalls: number;
  actionSuccesses: number;
  actionFailures: number;
  providerFailures: number;
  successfulResolutions: number;
  duplicateSuppressions: number;
  lastActionLatencyMs: number | null;
}

const state: LorrigoNdrMetricsSnapshot = {
  ndrCount: 0,
  fetchCalls: 0,
  actionCalls: 0,
  actionSuccesses: 0,
  actionFailures: 0,
  providerFailures: 0,
  successfulResolutions: 0,
  duplicateSuppressions: 0,
  lastActionLatencyMs: null,
};

export function recordNdrFetch(count: number): void {
  state.fetchCalls += 1;
  state.ndrCount += Math.max(0, count);
}

export function recordNdrAction(opts: { ok: boolean; latencyMs: number; resolved?: boolean }): void {
  state.actionCalls += 1;
  state.lastActionLatencyMs = opts.latencyMs;
  if (opts.ok) state.actionSuccesses += 1;
  else {
    state.actionFailures += 1;
    state.providerFailures += 1;
  }
  if (opts.resolved) state.successfulResolutions += 1;
}

export function recordNdrDuplicateSuppressed(): void {
  state.duplicateSuppressions += 1;
}

export function recordNdrProviderFailure(): void {
  state.providerFailures += 1;
}

export function getLorrigoNdrMetrics(): LorrigoNdrMetricsSnapshot {
  return { ...state };
}

export function resetLorrigoNdrMetricsForTests(): void {
  state.ndrCount = 0;
  state.fetchCalls = 0;
  state.actionCalls = 0;
  state.actionSuccesses = 0;
  state.actionFailures = 0;
  state.providerFailures = 0;
  state.successfulResolutions = 0;
  state.duplicateSuppressions = 0;
  state.lastActionLatencyMs = null;
}
