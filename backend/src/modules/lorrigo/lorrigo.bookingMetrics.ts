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
}

const state = {
  attempts: 0,
  successes: 0,
  failures: 0,
  validationFailures: 0,
  duplicateAttempts: 0,
  lastLatencyMs: null as number | null,
};

export function recordBookingAttempt(latencyMs: number): void {
  state.attempts += 1;
  state.lastLatencyMs = latencyMs;
}

export function recordBookingSuccess(latencyMs: number): void {
  state.successes += 1;
  state.lastLatencyMs = latencyMs;
}

export function recordBookingFailure(latencyMs: number): void {
  state.failures += 1;
  state.lastLatencyMs = latencyMs;
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
    ...state,
    successRate: decided > 0 ? state.successes / decided : null,
  };
}

export function resetLorrigoBookingMetricsForTests(): void {
  state.attempts = 0;
  state.successes = 0;
  state.failures = 0;
  state.validationFailures = 0;
  state.duplicateAttempts = 0;
  state.lastLatencyMs = null;
}
