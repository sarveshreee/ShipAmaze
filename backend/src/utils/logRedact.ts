/** Strip common secret patterns from strings before logging. */
export function redactForLog(input: string): string {
  return input
    .replace(/Bearer\s+[\w.-]+/gi, "Bearer [redacted]")
    .replace(/(password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/eyJ[\w-]*\.eyJ[\w.-]+\.[\w.-]+/g, "[jwt-redacted]");
}

export function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return redactForLog(err.message);
  return redactForLog(String(err));
}
