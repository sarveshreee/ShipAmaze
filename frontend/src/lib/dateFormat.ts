/**
 * Format stored timestamps as DD/MM/YYYY. Never invents a clock time.
 * Date-only values stay date-only; real datetimes include HH:mm:ss.
 */

const IST = "Asia/Kolkata";
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

type ParsedRealDate = { date: Date; hasTime: boolean };

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

function parseRealDate(value: unknown): ParsedRealDate | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { date: value, hasTime: true };
  }
  const s = String(value).trim();
  if (!s) return null;
  if (YMD_RE.test(s)) {
    const [y, mo, d] = s.split("-").map(Number);
    if (!y || !mo || !d) return null;
    return { date: new Date(y, mo - 1, d), hasTime: false };
  }
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  const hasTime = /T\d{2}:\d{2}| \d{1,2}:\d{2}|GMT|UTC|IST/i.test(s);
  return { date: parsed, hasTime };
}

function formatParts(date: Date): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
}

export function formatDdMmYyyy(value: unknown): string {
  const parsed = parseRealDate(value);
  if (!parsed) return "";
  const parts = formatParts(parsed.date);
  const day = part(parts, "day");
  const month = part(parts, "month");
  const year = part(parts, "year");
  if (!day || !month || !year) return "";
  return `${day}/${month}/${year}`;
}

export function formatDdMmYyyyHms(value: unknown): string {
  const parsed = parseRealDate(value);
  if (!parsed) return "";
  const datePart = formatDdMmYyyy(parsed.date);
  if (!datePart) return "";
  if (!parsed.hasTime) return datePart;
  const parts = formatParts(parsed.date);
  const hour = part(parts, "hour");
  const minute = part(parts, "minute");
  const second = part(parts, "second");
  if (!hour || !minute) return datePart;
  return `${datePart} ${hour}:${minute}:${second || "00"}`;
}

/** Compact real timestamp for order rows: DD/MM/YYYY HH:mm */
export function formatOrderDateTime(value: unknown): string {
  const parsed = parseRealDate(value);
  if (!parsed) return "";
  const datePart = formatDdMmYyyy(parsed.date);
  if (!datePart) return "";
  if (!parsed.hasTime) return datePart;
  const parts = formatParts(parsed.date);
  const hour = part(parts, "hour");
  const minute = part(parts, "minute");
  if (!hour || !minute) return datePart;
  return `${datePart} ${hour}:${minute}`;
}
