/**
 * Lorrigo booking metrics (process lifetime).
 */

export interface LorrigoBookingMetricsSnapshot {
  attempts: number;
  successes: number;
  failures: number;
  validationFailures: number;
  duplicateAttempts: number;
  lastLatencyMs: number | null;
  successRate: number | null;
  averageLatencyMs: number | null;
  lastSuccessfulBookingAt: string | null;
  lastFailedBookingAt: string | null;
}

const state = {
  attempts: 0,
  successes: 0,
  failures: 0,
  validationFailures: 0,
  duplicateAttempts: 0,
  lastLatencyMs: null as number | null,
  latencySumMs: 0,
  latencySamples: 0,
  lastSuccessfulBookingAt: null as string | null,
  lastFailedBookingAt: null as string | null,
};

export function recordBookingAttempt(latencyMs: number): void {
  state.attempts += 1;
  if (latencyMs > 0) {
    state.lastLatencyMs = latencyMs;
  }
}

export function recordBookingSuccess(latencyMs: number): void {
  state.successes += 1;
  state.lastLatencyMs = latencyMs;
  state.latencySumMs += latencyMs;
  state.latencySamples += 1;
  state.lastSuccessfulBookingAt = new Date().toISOString();
}

export function recordBookingFailure(latencyMs: number): void {
  state.failures += 1;
  state.lastLatencyMs = latencyMs;
  state.latencySumMs += latencyMs;
  state.latencySamples += 1;
  state.lastFailedBookingAt = new Date().toISOString();
}

export function recordBookingValidationFailure(): void {
  state.validationFailures += 1;
}

export function recordDuplicateBookingAttempt(): void {
  state.duplicateAttempts += 1;
}

export function getLorrigoBookingMetrics(): LorrigoBookingMetricsSnapshot {
  const decided = state.successes + state.failures;
  return {
    attempts: state.attempts,
    successes: state.successes,
    failures: state.failures,
    validationFailures: state.validationFailures,
    duplicateAttempts: state.duplicateAttempts,
    lastLatencyMs: state.lastLatencyMs,
    successRate: decided > 0 ? state.successes / decided : null,
    averageLatencyMs:
      state.latencySamples > 0 ? Math.round(state.latencySumMs / state.latencySamples) : null,
    lastSuccessfulBookingAt: state.lastSuccessfulBookingAt,
    lastFailedBookingAt: state.lastFailedBookingAt,
  };
}

export function resetLorrigoBookingMetricsForTests(): void {
  state.attempts = 0;
  state.successes = 0;
  state.failures = 0;
  state.validationFailures = 0;
  state.duplicateAttempts = 0;
  state.lastLatencyMs = null;
  state.latencySumMs = 0;
  state.latencySamples = 0;
  state.lastSuccessfulBookingAt = null;
  state.lastFailedBookingAt = null;
}
