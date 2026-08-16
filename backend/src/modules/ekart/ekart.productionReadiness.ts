/**
 * EKART production readiness checklist (CODE VERIFIED only — not LIVE VERIFIED).
 *
 * Do NOT set EKART_ENABLED=true until every "Required before enable" item is confirmed
 * with Durin/merchant credentials on staging.
 */

export const EKART_PRODUCTION_READINESS = {
  status: "CODE_VERIFIED_NOT_LIVE" as const,
  enableFlag: "EKART_ENABLED",
  requiredEnv: [
    "EKART_ENABLED=true",
    "EKART_AUTHORIZATION",
    "EKART_MERCHANT_CODE",
    "EKART_BASE_URL",
  ] as const,
  optionalEnv: [
    "EKART_WEBHOOKS_ENABLED",
    "EKART_WEBHOOK_SECRET",
    "EKART_CANCEL_ENABLED",
    "EKART_SERVICE_CODE",
    "EKART_TIMEOUT_MS",
    "EKART_RETRY_COUNT",
  ] as const,
  capabilities: {
    authenticate: "CODE_VERIFIED",
    serviceability: "CODE_VERIFIED",
    createShipment: "CODE_VERIFIED",
    codCollectableAmount: "CODE_VERIFIED — bookShipment passes orderCodCollectableAmount",
    awb: "CODE_VERIFIED",
    label: "NOT_SUPPORTED — capabilities.labels=false",
    tracking: "CODE_VERIFIED",
    statusSync: "CODE_VERIFIED — background poll when enabled",
    webhooks: "CODE_VERIFIED — off until EKART_WEBHOOKS_ENABLED",
    cancel: "CODE_VERIFIED — gated by EKART_CANCEL_ENABLED",
    ndr: "NOT_SUPPORTED",
    rates: "NOT_SUPPORTED",
  } as const,
  preEnableChecklist: [
    "Obtain Durin merchant code + Basic auth from Ekart",
    "Confirm Non-Large FORWARD service_code with merchant",
    "Staging: serviceability for known COD + prepaid pincodes",
    "Staging: book one COD order and verify amount_to_collect === codCollectableAmount",
    "Staging: track AWB + status sync",
    "Confirm webhook enrollment before EKART_WEBHOOKS_ENABLED",
    "Confirm cancel merchant access before EKART_CANCEL_ENABLED",
    "Never invent credentials or API endpoints",
  ] as const,
};

export function ekartReadinessSummary(): string {
  return [
    `Ekart status: ${EKART_PRODUCTION_READINESS.status}`,
    `Enable only after checklist (${EKART_PRODUCTION_READINESS.preEnableChecklist.length} items).`,
    `Labels/NDR/rates: not supported in current adapter.`,
  ].join(" ");
}
