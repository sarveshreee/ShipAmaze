/** Partner API scopes — granular permissions for API keys. */
export const PARTNER_SCOPES = {
  SERVICEABILITY_READ: "serviceability:read",
  RATES_READ: "rates:read",
  SHIPMENTS_CREATE: "shipments:create",
  SHIPMENTS_READ: "shipments:read",
  SHIPMENTS_CANCEL: "shipments:cancel",
} as const;

export type PartnerScope = (typeof PARTNER_SCOPES)[keyof typeof PARTNER_SCOPES];

export const ALL_PARTNER_SCOPES: PartnerScope[] = Object.values(PARTNER_SCOPES);

export function isValidPartnerScope(scope: string): boolean {
  return (ALL_PARTNER_SCOPES as string[]).includes(scope);
}

export function normalizePartnerScopes(scopes: string[]): PartnerScope[] {
  const out: PartnerScope[] = [];
  for (const s of scopes) {
    const trimmed = String(s).trim();
    if (isValidPartnerScope(trimmed)) out.push(trimmed as PartnerScope);
  }
  return out;
}
