import { describe, expect, it } from "vitest";
import { formatDdMmYyyy, formatDdMmYyyyHms, firstRealDate } from "./dateFormat.js";

describe("dateFormat", () => {
  it("formats YYYY-MM-DD as DD/MM/YYYY without inventing a time", () => {
    expect(formatDdMmYyyy("2026-08-01")).toBe("01/08/2026");
    expect(formatDdMmYyyyHms("2026-08-01")).toBe("01/08/2026");
  });

  it("formats real ISO datetimes as DD/MM/YYYY HH:mm:ss in IST", () => {
    const out = formatDdMmYyyyHms("2026-08-06T08:23:27+05:30");
    expect(out).toBe("06/08/2026 08:23:27");
  });

  it("does not invent dates for empty or invalid values", () => {
    expect(formatDdMmYyyy("")).toBe("");
    expect(formatDdMmYyyyHms(undefined)).toBe("");
    expect(formatDdMmYyyy("not-a-date")).toBe("");
    expect(firstRealDate("", null, "garbage")).toBeUndefined();
  });

  it("uses the first real timestamp and skips empties", () => {
    expect(firstRealDate("", "2026-08-01", new Date("2026-08-06T08:23:27+05:30"))).toBe("2026-08-01");
  });
});
