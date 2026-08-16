/**
 * Canonical Shopify / order payment normalization.
 * ONE source of truth for COD vs Prepaid, paid vs outstanding, collectable COD.
 *
 * Partial-payment apps (deposit apps) leave financial_status = partially_paid
 * with total_outstanding > 0. Those MUST be COD/collectable for the remainder —
 * never treated as fully Prepaid.
 */

export type NormalizedOrderPayment = {
  orderTotal: number;
  amountPaid: number;
  amountOutstanding: number;
  /** Amount courier should collect (COD collectible). */
  codAmount: number;
  /** ShipAmaze binary payment field used by booking/UI. */
  payment: "COD" | "Prepaid";
  paymentStatus: "unpaid" | "partially_paid" | "paid" | "refunded" | "voided" | "authorized" | "pending" | "unknown";
  isFullyPrepaid: boolean;
  isCOD: boolean;
  isPartiallyPaid: boolean;
  /** Human-readable reason for debugging / reconciliation. */
  reason: string;
};

export type ShopifyPaymentSource = {
  financial_status?: string | null;
  total_price?: string | number | null;
  /** Shopify Admin REST: remaining balance to collect. */
  total_outstanding?: string | number | null;
  current_total_price?: string | number | null;
  payment_gateway_names?: string[] | null;
  gateway?: string | null;
  tags?: string | null;
  /** Optional transaction list when available. */
  transactions?: Array<{
    kind?: string | null;
    status?: string | null;
    amount?: string | number | null;
  }> | null;
};

const KNOWN_ONLINE_GATEWAYS =
  /razorpay|payu|paypal|stripe|shopify_payments|cashfree|instamojo|ccavenue|phonepe|paytm|juspay|billdesk|airpay|payubiz|worldline|atom|hdfc|icici|axis|upi|net_?banking|debit|credit|wallet|gpay|google_pay|amazon_?pay/;

function money(n: unknown): number {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? "0"));
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function gatewayHaystack(so: ShopifyPaymentSource): string {
  const parts: string[] = [];
  if (Array.isArray(so.payment_gateway_names)) {
    parts.push(...so.payment_gateway_names.map((g) => String(g)));
  }
  if (so.gateway) parts.push(String(so.gateway));
  return parts.join(" ").toLowerCase();
}

export function shopifyOrderHasExplicitCodSignal(so: ShopifyPaymentSource): boolean {
  const gateways = gatewayHaystack(so);
  if (/cash\s*on\s*delivery|\bcod\b|cash_on_delivery/.test(gateways)) return true;
  const tags = String(so.tags ?? "").toLowerCase();
  if (/\bcod\b/.test(tags) || /cash\s*on\s*delivery/.test(tags)) return true;
  return false;
}

/** Sum successful sale/capture transactions when present. */
export function sumSuccessfulShopifyPayments(so: ShopifyPaymentSource): number | null {
  const txs = so.transactions;
  if (!Array.isArray(txs) || txs.length === 0) return null;
  let paid = 0;
  let saw = false;
  for (const t of txs) {
    const kind = String(t.kind ?? "").toLowerCase();
    const status = String(t.status ?? "").toLowerCase();
    if (!["sale", "capture"].includes(kind)) continue;
    if (status && status !== "success") continue;
    saw = true;
    paid += money(t.amount);
  }
  return saw ? Math.round(paid * 100) / 100 : null;
}

/**
 * Normalize Shopify (or Shopify-like) order payment into canonical fields.
 */
export function normalizeShopifyOrderPayment(so: ShopifyPaymentSource): NormalizedOrderPayment {
  const orderTotal = money(so.current_total_price ?? so.total_price);
  const financial = String(so.financial_status ?? "").toLowerCase().trim();
  const gateways = gatewayHaystack(so);
  const explicitCod = shopifyOrderHasExplicitCodSignal(so);

  let amountOutstanding = money(so.total_outstanding);
  const hasOutstandingField =
    so.total_outstanding != null && String(so.total_outstanding).trim() !== "";

  const fromTx = sumSuccessfulShopifyPayments(so);
  let amountPaid: number;
  if (fromTx != null) {
    amountPaid = Math.min(orderTotal, fromTx);
    if (!hasOutstandingField) {
      amountOutstanding = Math.max(0, Math.round((orderTotal - amountPaid) * 100) / 100);
    }
  } else if (hasOutstandingField) {
    amountOutstanding = Math.max(0, amountOutstanding);
    amountPaid = Math.max(0, Math.round((orderTotal - amountOutstanding) * 100) / 100);
  } else if (financial === "paid") {
    amountPaid = orderTotal;
    amountOutstanding = 0;
  } else if (financial === "partially_paid") {
    // Without outstanding/transactions we cannot invent paid amount — treat remainder as full COD risk.
    // Prefer classifying as COD collectable for full total when Shopify did not send outstanding.
    amountPaid = 0;
    amountOutstanding = orderTotal;
  } else if (financial === "pending" || financial === "" || financial === "authorized") {
    amountPaid = 0;
    amountOutstanding = orderTotal;
  } else if (financial === "refunded" || financial === "voided") {
    amountPaid = 0;
    amountOutstanding = 0;
  } else if (financial === "partially_refunded") {
    amountPaid = orderTotal;
    amountOutstanding = 0;
  } else {
    amountPaid = 0;
    amountOutstanding = orderTotal;
  }

  // Clamp
  amountPaid = Math.max(0, Math.min(orderTotal, amountPaid));
  amountOutstanding = Math.max(0, Math.min(orderTotal, amountOutstanding));

  let paymentStatus: NormalizedOrderPayment["paymentStatus"] = "unknown";
  if (["paid", "partially_paid", "pending", "authorized", "refunded", "voided", "partially_refunded"].includes(financial)) {
    paymentStatus = financial === "partially_refunded" ? "refunded" : (financial as NormalizedOrderPayment["paymentStatus"]);
  } else if (amountOutstanding <= 0 && amountPaid > 0) {
    paymentStatus = "paid";
  } else if (amountPaid > 0 && amountOutstanding > 0) {
    paymentStatus = "partially_paid";
  } else if (amountOutstanding > 0) {
    paymentStatus = "pending";
  }

  const isPartiallyPaid = amountPaid > 0 && amountOutstanding > 0;
  const isFullyPrepaid =
    financial === "paid" ||
    (amountOutstanding <= 0 && amountPaid >= orderTotal && orderTotal > 0);

  // Manual COD gateway (Shopify built-in) when pending and no online gateway.
  const manualCod =
    (financial === "pending" || financial === "") &&
    /\bmanual\b/.test(gateways) &&
    !KNOWN_ONLINE_GATEWAYS.test(gateways);

  let isCOD = false;
  let payment: "COD" | "Prepaid" = "Prepaid";
  let reason = "";

  if (financial === "refunded" || financial === "voided") {
    isCOD = false;
    payment = "Prepaid";
    amountOutstanding = 0;
    reason = `financial_status=${financial}`;
  } else if (explicitCod || manualCod) {
    isCOD = true;
    payment = "COD";
    if (amountOutstanding <= 0 && !isFullyPrepaid) {
      amountOutstanding = Math.max(0, orderTotal - amountPaid);
    }
    reason = explicitCod ? "explicit_cod_gateway_or_tag" : "manual_gateway_pending";
  } else if (isFullyPrepaid) {
    isCOD = false;
    payment = "Prepaid";
    amountOutstanding = 0;
    amountPaid = orderTotal > 0 ? orderTotal : amountPaid;
    reason = "fully_paid";
  } else if (financial === "authorized" || (financial === "pending" && KNOWN_ONLINE_GATEWAYS.test(gateways))) {
    // Online payment in progress — not courier COD
    isCOD = false;
    payment = "Prepaid";
    reason = financial === "authorized" ? "authorized_online" : "pending_online_gateway";
  } else if (isPartiallyPaid || financial === "partially_paid") {
    // CRITICAL: partially paid → collectable COD for remainder
    isCOD = true;
    payment = "COD";
    if (amountOutstanding <= 0) amountOutstanding = Math.max(0, orderTotal - amountPaid);
    if (amountOutstanding <= 0 && orderTotal > 0) amountOutstanding = orderTotal;
    reason =
      financial === "partially_paid"
        ? "partially_paid_outstanding_as_cod"
        : "partial_paid_outstanding_as_cod";
  } else if (amountOutstanding > 0 && amountPaid > 0) {
    isCOD = true;
    payment = "COD";
    reason = "outstanding_balance_as_cod";
  } else {
    // Unknown pending / empty → COD (cash to collect)
    isCOD = true;
    payment = "COD";
    amountOutstanding = orderTotal > 0 ? orderTotal : amountOutstanding;
    reason = "default_pending_as_cod";
  }

  const codAmount =
    payment === "COD"
      ? Math.max(0, amountOutstanding > 0 ? amountOutstanding : Math.max(0, orderTotal - amountPaid))
      : 0;

  return {
    orderTotal,
    amountPaid,
    amountOutstanding: payment === "COD" ? codAmount : 0,
    codAmount,
    payment,
    paymentStatus,
    isFullyPrepaid: payment === "Prepaid" && codAmount <= 0,
    isCOD: payment === "COD",
    isPartiallyPaid: amountPaid > 0 && codAmount > 0,
    reason,
  };
}

/** Map binary payment for legacy callers — prefers normalizeShopifyOrderPayment. */
export function mapShopifyOrderPaymentFromNormalized(n: NormalizedOrderPayment): "COD" | "Prepaid" {
  return n.payment;
}

/**
 * Collectable COD amount for courier booking / labels / remittance.
 * Prefers persisted `codCollectableAmount` (partial payments); falls back to full amount for COD.
 */
export function orderCodCollectableAmount(order: {
  payment?: string | null;
  amount?: number | null;
  codCollectableAmount?: number | null;
  amountOutstanding?: number | null;
}): number {
  const pay = String(order.payment ?? "").toUpperCase();
  if (pay !== "COD") return 0;
  const explicit = Number(order.codCollectableAmount);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit * 100) / 100;
  const outstanding = Number(order.amountOutstanding);
  if (Number.isFinite(outstanding) && outstanding > 0) return Math.round(outstanding * 100) / 100;
  const total = Number(order.amount);
  return Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : 0;
}

function money2(n: unknown): number {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? "0"));
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

/**
 * Persist canonical payment fields for manual create/update (non-Shopify).
 * `amount` is always the invoice/order total. Collectable COD is separate.
 */
export function resolveManualOrderPaymentFields(input: {
  payment: "COD" | "Prepaid" | string;
  /** Invoice / order total */
  amount: number;
  /** Explicit collectable override (partial COD). */
  codCollectableAmount?: number | null;
  /** Alias used by some UI forms. */
  codAmount?: number | null;
  amountPaid?: number | null;
  amountOutstanding?: number | null;
}): {
  payment: "COD" | "Prepaid";
  amount: number;
  amountPaid: number;
  amountOutstanding: number;
  codCollectableAmount: number;
  isFullyPrepaid: boolean;
  isPartiallyPaid: boolean;
} {
  const payment: "COD" | "Prepaid" =
    String(input.payment ?? "").trim().toUpperCase() === "COD" ? "COD" : "Prepaid";
  const amount = Math.max(0, money2(input.amount));

  if (payment === "Prepaid") {
    return {
      payment,
      amount,
      amountPaid: amount,
      amountOutstanding: 0,
      codCollectableAmount: 0,
      isFullyPrepaid: amount > 0,
      isPartiallyPaid: false,
    };
  }

  const explicitCollectable =
    input.codCollectableAmount != null && String(input.codCollectableAmount).trim() !== ""
      ? money2(input.codCollectableAmount)
      : input.codAmount != null && String(input.codAmount).trim() !== ""
        ? money2(input.codAmount)
        : null;

  let collectable =
    explicitCollectable != null && explicitCollectable >= 0
      ? Math.min(amount, explicitCollectable)
      : amount;

  if (input.amountOutstanding != null && String(input.amountOutstanding).trim() !== "" && explicitCollectable == null) {
    collectable = Math.min(amount, Math.max(0, money2(input.amountOutstanding)));
  }

  const amountPaid =
    input.amountPaid != null && String(input.amountPaid).trim() !== ""
      ? Math.min(amount, Math.max(0, money2(input.amountPaid)))
      : Math.max(0, Math.round((amount - collectable) * 100) / 100);

  return {
    payment,
    amount,
    amountPaid,
    amountOutstanding: collectable,
    codCollectableAmount: collectable,
    isFullyPrepaid: false,
    isPartiallyPaid: amountPaid > 0 && collectable > 0,
  };
}
