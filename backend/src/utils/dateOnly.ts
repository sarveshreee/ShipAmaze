/**
 * Parse YYYY-MM-DD query params as Asia/Kolkata calendar-day bounds.
 * Avoids `new Date("YYYY-MM-DD")` (UTC midnight) + local `setHours` skew.
 */

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** IST = UTC+5:30 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function parseYmdStart(raw: unknown): Date | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  const m = YMD_RE.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || !mo || !d) return undefined;
    return new Date(Date.UTC(y, mo - 1, d) - IST_OFFSET_MS);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseYmdEnd(raw: unknown): Date | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  const m = YMD_RE.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || !mo || !d) return undefined;
    // End of IST calendar day = next IST midnight − 1ms
    return new Date(Date.UTC(y, mo - 1, d + 1) - IST_OFFSET_MS - 1);
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setHours(23, 59, 59, 999);
  return d;
}
