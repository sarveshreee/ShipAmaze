import type { IKycDocuments } from "../models/KycProfile.js";

export const KYC_DOC_KEYS = [
  "pan",
  "aadhaar",
  "aadhaarFront",
  "aadhaarBack",
  "gst",
  "cin",
  "reg",
  "auth_id",
] as const;

export type KycDocKey = (typeof KYC_DOC_KEYS)[number];

/** ~5MB binary ≈ 6.7MB base64; allow a small buffer. */
export const MAX_KYC_DOC_CHARS = 7_500_000;

const DOC_URL_RE = /^(data:image\/(jpeg|jpg|png|webp);base64,|https?:\/\/)/i;

/**
 * Resolve documents for draft save.
 * When the client sends `uploaded_docs` / `documents`, treat that object as the
 * authoritative set (empty keys = removed). Otherwise keep existing docs.
 */
export function resolveKycDocuments(
  bodyHasDocs: boolean,
  existing: IKycDocuments | undefined | null,
  incoming: Partial<IKycDocuments>
): IKycDocuments {
  if (!bodyHasDocs) {
    return { ...(existing ?? {}) };
  }
  const out: IKycDocuments = {};
  for (const key of KYC_DOC_KEYS) {
    const v = incoming[key];
    if (typeof v === "string" && v.trim()) {
      out[key] = v.trim();
    }
  }
  return out;
}

/** Submit: overlay non-empty incoming docs onto previously saved draft docs. */
export function mergeKycDocumentsForSubmit(
  existing: IKycDocuments | undefined | null,
  incoming: Partial<IKycDocuments>
): IKycDocuments {
  const out: IKycDocuments = { ...(existing ?? {}) };
  for (const key of KYC_DOC_KEYS) {
    const v = incoming[key];
    if (typeof v === "string" && v.trim()) {
      out[key] = v.trim();
    }
  }
  return out;
}

/** Drop binary doc fields from legacy `data` blob to avoid Mongo 16MB / duplication. */
export function stripKycDocFieldsFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...body };
  delete next.uploaded_docs;
  delete next.documents;
  return next;
}

export function buildKycLegacyData(
  existing: Record<string, unknown> | undefined | null,
  body: Record<string, unknown>
): Record<string, unknown> {
  const merged = {
    ...((existing as Record<string, unknown>) ?? {}),
    ...stripKycDocFieldsFromBody(body),
  };
  delete merged.uploaded_docs;
  delete merged.documents;
  return merged;
}

export function assertValidKycDocumentPayload(docs: Partial<IKycDocuments>): string | null {
  for (const key of KYC_DOC_KEYS) {
    const v = docs[key];
    if (v == null || v === "") continue;
    if (typeof v !== "string") return `${key} must be a string`;
    if (v.length > MAX_KYC_DOC_CHARS) {
      return `${key} is too large (max ~5MB per file)`;
    }
    if (!DOC_URL_RE.test(v) && !(v.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(v))) {
      return `${key} must be an image data URL or http(s) URL`;
    }
  }
  return null;
}

export function settingsLinkForRole(role?: string | null): string {
  return role === "vendor" ? "/vendor/settings" : "/dropshipper/settings";
}
