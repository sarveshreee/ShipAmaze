/**
 * Lorrigo status-sync health metrics (process lifetime).
 */

export interface LorrigoStatusSyncHealth {
  activeShipments: number;
  lastPollAt: string | null;
  lastSuccessfulSyncAt: string | null;
  consecutiveFailures: number;
  lastSyncLatencyMs: number | null;
  lastProviderLatencyMs: number | null;
  statusChanges: number;
  pollFailures: number;
  polls: number;
}

const state = {
  activeShipments: 0,
  lastPollAt: null as Date | null,
  lastSuccessfulSyncAt: null as Date | null,
  consecutiveFailures: 0,
  lastSyncLatencyMs: null as number | null,
  lastProviderLatencyMs: null as number | null,
  statusChanges: 0,
  pollFailures: 0,
  polls: 0,
};

export function recordStatusSyncPoll(opts: {
  activeShipments: number;
  latencyMs: number;
  providerLatencyMs?: number;
  statusChanges: number;
  failures: number;
  hadSuccess: boolean;
}): void {
  state.polls += 1;
  state.activeShipments = opts.activeShipments;
  state.lastPollAt = new Date();
  state.lastSyncLatencyMs = opts.latencyMs;
  if (opts.providerLatencyMs != null) state.lastProviderLatencyMs = opts.providerLatencyMs;
  state.statusChanges += opts.statusChanges;
  state.pollFailures += opts.failures;
  if (opts.hadSuccess) {
    state.lastSuccessfulSyncAt = new Date();
    state.consecutiveFailures = 0;
  } else if (opts.failures > 0) {
    state.consecutiveFailures += 1;
  }
}

export function getLorrigoStatusSyncHealth(): LorrigoStatusSyncHealth {
  return {
    activeShipments: state.activeShipments,
    lastPollAt: state.lastPollAt?.toISOString() ?? null,
    lastSuccessfulSyncAt: state.lastSuccessfulSyncAt?.toISOString() ?? null,
    consecutiveFailures: state.consecutiveFailures,
    lastSyncLatencyMs: state.lastSyncLatencyMs,
    lastProviderLatencyMs: state.lastProviderLatencyMs,
    statusChanges: state.statusChanges,
    pollFailures: state.pollFailures,
    polls: state.polls,
  };
}

export function resetLorrigoStatusSyncMetricsForTests(): void {
  state.activeShipments = 0;
  state.lastPollAt = null;
  state.lastSuccessfulSyncAt = null;
  state.consecutiveFailures = 0;
  state.lastSyncLatencyMs = null;
  state.lastProviderLatencyMs = null;
  state.statusChanges = 0;
  state.pollFailures = 0;
  state.polls = 0;
}
