import { AppError } from "../middleware/errorMiddleware.js";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function trimStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export function normalizePincodeIndia(v: string): string {
  return v.replace(/\D/g, "").slice(0, 6);
}

export function validateIndianPincode(pin: string, field = "pincode"): void {
  if (!/^\d{6}$/.test(pin)) {
    throw new AppError(400, `${field} must be exactly 6 digits`);
  }
  if (pin === "000000" || pin === "999999") {
    throw new AppError(400, `${field} is not valid`);
  }
}

/** Keep digits and leading + for international; strip spaces and dashes */
export function normalizePhoneInput(v: string): string {
  const t = v.trim();
  if (!t) return "";
  if (t.startsWith("+")) {
    return `+${t.slice(1).replace(/[^\d]/g, "")}`;
  }
  return t.replace(/[^\d]/g, "");
}

/**
 * For Indian operations: require 10-digit mobile (after stripping country code 91).
 * Optional phones may be empty.
 */
export function validateIndianPhone(phone: string, label: string, required: boolean): void {
  if (!phone) {
    if (required) throw new AppError(400, `${label} is required`);
    return;
  }
  let d = phone.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length !== 10) {
    throw new AppError(400, `${label} must be a valid 10-digit Indian mobile number`);
  }
  if (!/^[6-9]/.test(d)) {
    throw new AppError(400, `${label} must be a valid Indian mobile number`);
  }
}

/** Normalize to last 10 digits (India) for comparison */
function indianMobileCore(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}

/** After validateIndianPhone for primary and optional alt */
export function assertIndianPhonesDistinct(primary: string, alternate: string, altLabel = "alternatePhone"): void {
  if (!alternate.trim()) return;
  const a = indianMobileCore(primary);
  const b = indianMobileCore(alternate);
  if (a.length === 10 && b.length === 10 && a === b) {
    throw new AppError(400, `${altLabel} must be different from primary phone`);
  }
}

export function validateGstinOptional(gstin: string | undefined): void {
  if (gstin == null || gstin === "") return;
  const u = gstin.trim().toUpperCase();
  if (!GSTIN_RE.test(u)) {
    throw new AppError(400, "GSTIN must be a valid 15-character format");
  }
}

export function validateEmailOptional(email: string): void {
  if (!email) return;
  if (email.length > 320) throw new AppError(400, "Email is too long");
  const basic = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basic.test(email)) throw new AppError(400, "Email format is invalid");
}

function normPart(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Fingerprint for duplicate detection within one owner account */
export function pickupAddressFingerprint(parts: {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}): string {
  return [
    normPart(parts.addressLine1),
    normPart(parts.addressLine2),
    normPart(parts.city),
    normPart(parts.state),
    normalizePincodeIndia(parts.pincode),
    normPart(parts.country || "India"),
  ].join("|");
}
