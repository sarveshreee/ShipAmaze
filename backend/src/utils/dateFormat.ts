/**
 * Format stored timestamps as DD/MM/YYYY (IST). Never invents a clock time.
 * Date-only values stay date-only; real datetimes include HH:mm:ss.
 */

const IST = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

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

  const ymd = YMD_RE.exec(s);
  if (ymd) {
    const y = Number(ymd[1]);
    const mo = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (!y || !mo || !d) return null;
    return { date: new Date(Date.UTC(y, mo - 1, d) - IST_OFFSET_MS), hasTime: false };
  }

  const dmy = DMY_RE.exec(s);
  if (dmy) {
    const d = Number(dmy[1]);
    const mo = Number(dmy[2]);
    const y = Number(dmy[3]);
    const hh = dmy[4] != null ? Number(dmy[4]) : 0;
    const mm = dmy[5] != null ? Number(dmy[5]) : 0;
    const ss = dmy[6] != null ? Number(dmy[6]) : 0;
    const hasTime = dmy[4] != null;
    return {
      date: new Date(Date.UTC(y, mo - 1, d, hh, mm, ss) - IST_OFFSET_MS),
      hasTime,
    };
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

/** DD/MM/YYYY from a real stored value. Empty when the value is missing/invalid. */
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

/**
 * Real date+time when the source has a time component: DD/MM/YYYY HH:mm:ss.
 * Date-only values stay DD/MM/YYYY (does not invent 00:00:00).
 */
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

export function firstRealDate(...values: unknown[]): unknown {
  for (const v of values) {
    if (parseRealDate(v)) return v;
  }
  return undefined;
}
