/**
 * COURIER BOOKING ARCHITECTURE — Velocity path vs shared CourierProvider path
 * ============================================================================
 *
 * WHY VELOCITY BYPASS EXISTS (intentional, not a bug):
 *
 * 1. Velocity forward booking is deeply coupled to:
 *    - warehouse merge / Velocity warehouse_id resolution
 *    - carrier auto-assign + rate card + priority rules
 *    - label PDF cache / S3 presigned URL refresh
 *    - Shopify fulfillment mirror
 *    - wallet debit + billable shipping charge
 *    - status mapping from Velocity-specific payloads
 *
 * 2. Lorrigo + Ekart use the shared CourierProvider abstraction via:
 *    POST /api/courier/shipments → bookShipmentViaProvider → provider adapter
 *
 * 3. Velocity is still registered in the provider registry for discovery/serviceability,
 *    but HTTP create is rejected on /api/courier/shipments and must use:
 *    POST /api/velocity/forward/create  (or bookForwardShipmentForOrder / bookOrderViaProviderRegistry)
 *
 * CANONICAL SHARED RULES (must not be duplicated differently):
 * - COD collectable amount → orderCodCollectableAmount() / normalizeOrderPayment
 * - Wallet debit after book → attemptAndTrackShipmentWalletDebit / debitShipmentChargeIfApplicable
 * - Booking claim / idempotency → claimOrderForBooking (atomic bookingInProgress)
 *
 * PRODUCT DECISION — cancel shipment vs wallet refund:
 * Cancel (Velocity cancelShipment / Ekart cancel) currently updates order status only.
 * It does NOT credit/refund the wallet shipping debit.
 * TODO(product-decision): Confirm whether cancel/RTO should auto-credit
 *   referenceId `refund:shipment:{orderId}` via creditWallet. Do NOT implement until confirmed.
 */

export const VELOCITY_BOOKING_BYPASS_REASON =
  "Velocity forward booking remains on /api/velocity/forward/create due to warehouse merge, " +
  "label cache, carrier priority, and Shopify mirror coupling. Lorrigo/Ekart use /api/courier/shipments. " +
  "Both paths MUST use orderCodCollectableAmount and attemptAndTrackShipmentWalletDebit.";

export const CANCEL_SHIPMENT_WALLET_REFUND_POLICY = {
  automaticRefund: false as const,
  status: "undefined_pending_product_decision" as const,
  todo:
    "TODO(product-decision): Cancel/RTO must not auto-refund wallet until product confirms. " +
    "If approved, creditWallet with referenceId refund:shipment:{orderId} (unique index).",
};
