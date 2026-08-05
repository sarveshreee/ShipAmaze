/**
 * Ekart process-lifetime metrics (booking + tracking + retries/latency).
 */

export interface EkartBookingMetricsSnapshot {
  attempts: number;
  successes: number;
  failures: number;
  validationFailures: number;
  lastLatencyMs: number | null;
  successRate: number | null;
  averageLatencyMs: number | null;
  lastSuccessfulBookingAt: string | null;
  lastFailedBookingAt: string | null;
}

export interface EkartTrackingMetricsSnapshot {
  attempts: number;
  successes: number;
  failures: number;
  lastLatencyMs: number | null;
  averageLatencyMs: number | null;
}

const booking = {
  attempts: 0,
  successes: 0,
  failures: 0,
  validationFailures: 0,
  lastLatencyMs: null as number | null,
  latencySumMs: 0,
  latencySamples: 0,
  lastSuccessfulBookingAt: null as string | null,
  lastFailedBookingAt: null as string | null,
};

const tracking = {
  attempts: 0,
  successes: 0,
  failures: 0,
  lastLatencyMs: null as number | null,
  latencySumMs: 0,
  latencySamples: 0,
};

export function recordEkartBookingAttempt(latencyMs: number): void {
  booking.attempts += 1;
  if (latencyMs > 0) booking.lastLatencyMs = latencyMs;
}

export function recordEkartBookingSuccess(latencyMs: number): void {
  booking.successes += 1;
  booking.lastLatencyMs = latencyMs;
  booking.latencySumMs += latencyMs;
  booking.latencySamples += 1;
  booking.lastSuccessfulBookingAt = new Date().toISOString();
}

export function recordEkartBookingFailure(latencyMs: number): void {
  booking.failures += 1;
  booking.lastLatencyMs = latencyMs;
  booking.latencySumMs += latencyMs;
  booking.latencySamples += 1;
  booking.lastFailedBookingAt = new Date().toISOString();
}

export function recordEkartBookingValidationFailure(): void {
  booking.validationFailures += 1;
}

export function recordEkartTrackAttempt(): void {
  tracking.attempts += 1;
}

export function recordEkartTrackSuccess(latencyMs: number): void {
  tracking.successes += 1;
  tracking.lastLatencyMs = latencyMs;
  tracking.latencySumMs += latencyMs;
  tracking.latencySamples += 1;
}

export function recordEkartTrackFailure(latencyMs: number): void {
  tracking.failures += 1;
  tracking.lastLatencyMs = latencyMs;
  tracking.latencySumMs += latencyMs;
  tracking.latencySamples += 1;
}

export function getEkartBookingMetrics(): EkartBookingMetricsSnapshot {
  const decided = booking.successes + booking.failures;
  return {
    attempts: booking.attempts,
    successes: booking.successes,
    failures: booking.failures,
    validationFailures: booking.validationFailures,
    lastLatencyMs: booking.lastLatencyMs,
    successRate: decided > 0 ? booking.successes / decided : null,
    averageLatencyMs:
      booking.latencySamples > 0
        ? Math.round(booking.latencySumMs / booking.latencySamples)
        : null,
    lastSuccessfulBookingAt: booking.lastSuccessfulBookingAt,
    lastFailedBookingAt: booking.lastFailedBookingAt,
  };
}

export function getEkartTrackingMetrics(): EkartTrackingMetricsSnapshot {
  return {
    attempts: tracking.attempts,
    successes: tracking.successes,
    failures: tracking.failures,
    lastLatencyMs: tracking.lastLatencyMs,
    averageLatencyMs:
      tracking.latencySamples > 0
        ? Math.round(tracking.latencySumMs / tracking.latencySamples)
        : null,
  };
}

export function resetEkartMetricsForTests(): void {
  booking.attempts = 0;
  booking.successes = 0;
  booking.failures = 0;
  booking.validationFailures = 0;
  booking.lastLatencyMs = null;
  booking.latencySumMs = 0;
  booking.latencySamples = 0;
  booking.lastSuccessfulBookingAt = null;
  booking.lastFailedBookingAt = null;
  tracking.attempts = 0;
  tracking.successes = 0;
  tracking.failures = 0;
  tracking.lastLatencyMs = null;
  tracking.latencySumMs = 0;
  tracking.latencySamples = 0;
}
