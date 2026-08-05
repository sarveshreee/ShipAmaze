/**
 * Ekart status-sync health metrics (process lifetime).
 */

export interface EkartStatusSyncMetricsSnapshot {
  polls: number;
  consecutiveFailures: number;
  lastPollAt: string | null;
  lastSuccessAt: string | null;
  lastProcessed: number;
  lastUpdated: number;
  lastErrors: number;
  lastLatencyMs: number | null;
}

const state = {
  polls: 0,
  consecutiveFailures: 0,
  lastPollAt: null as string | null,
  lastSuccessAt: null as string | null,
  lastProcessed: 0,
  lastUpdated: 0,
  lastErrors: 0,
  lastLatencyMs: null as number | null,
};

export function recordEkartStatusSyncPoll(opts: {
  processed: number;
  updated: number;
  errors: number;
  durationMs: number;
  ok: boolean;
}): void {
  state.polls += 1;
  state.lastPollAt = new Date().toISOString();
  state.lastProcessed = opts.processed;
  state.lastUpdated = opts.updated;
  state.lastErrors = opts.errors;
  state.lastLatencyMs = opts.durationMs;
  if (opts.ok) {
    state.consecutiveFailures = 0;
    state.lastSuccessAt = state.lastPollAt;
  } else {
    state.consecutiveFailures += 1;
  }
}

export function getEkartStatusSyncMetrics(): EkartStatusSyncMetricsSnapshot {
  return { ...state };
}

export function resetEkartStatusSyncMetricsForTests(): void {
  state.polls = 0;
  state.consecutiveFailures = 0;
  state.lastPollAt = null;
  state.lastSuccessAt = null;
  state.lastProcessed = 0;
  state.lastUpdated = 0;
  state.lastErrors = 0;
  state.lastLatencyMs = null;
}
