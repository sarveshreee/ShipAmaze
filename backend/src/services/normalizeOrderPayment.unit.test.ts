import { describe, expect, it } from "vitest";
import { normalizeShopifyOrderPayment, orderCodCollectableAmount, resolveManualOrderPaymentFields } from "./normalizeOrderPayment.js";

describe("normalizeShopifyOrderPayment", () => {
  it("marks fully paid as Prepaid", () => {
    const n = normalizeShopifyOrderPayment({
      financial_status: "paid",
      total_price: "1000",
      total_outstanding: "0",
      payment_gateway_names: ["razorpay"],
    });
    expect(n.payment).toBe("Prepaid");
    expect(n.isFullyPrepaid).toBe(true);
    expect(n.codAmount).toBe(0);
    expect(n.amountPaid).toBe(1000);
  });

  it("treats partially_paid with outstanding as COD collectable for remainder", () => {
    const n = normalizeShopifyOrderPayment({
      financial_status: "partially_paid",
      total_price: "1000",
      total_outstanding: "700",
      payment_gateway_names: ["razorpay"],
    });
    expect(n.payment).toBe("COD");
    expect(n.isPartiallyPaid).toBe(true);
    expect(n.amountPaid).toBe(300);
    expect(n.codAmount).toBe(700);
    expect(n.isFullyPrepaid).toBe(false);
  });

  it("uses transactions to compute paid/outstanding when present", () => {
    const n = normalizeShopifyOrderPayment({
      financial_status: "partially_paid",
      total_price: "1000",
      transactions: [
        { kind: "sale", status: "success", amount: "250" },
        { kind: "sale", status: "success", amount: "50" },
      ],
    });
    expect(n.amountPaid).toBe(300);
    expect(n.codAmount).toBe(700);
    expect(n.payment).toBe("COD");
  });

  it("detects explicit COD gateway", () => {
    const n = normalizeShopifyOrderPayment({
      financial_status: "pending",
      total_price: "999",
      payment_gateway_names: ["Cash on Delivery (COD)"],
    });
    expect(n.payment).toBe("COD");
    expect(n.codAmount).toBe(999);
  });

  it("detects COD tag", () => {
    const n = normalizeShopifyOrderPayment({
      financial_status: "pending",
      total_price: "500",
      tags: "COD, priority",
      payment_gateway_names: [],
    });
    expect(n.payment).toBe("COD");
  });

  it("treats manual pending without online gateway as COD", () => {
    const n = normalizeShopifyOrderPayment({
      financial_status: "pending",
      total_price: "400",
      payment_gateway_names: ["manual"],
    });
    expect(n.payment).toBe("COD");
  });

  it("treats pending + razorpay as Prepaid (payment in progress)", () => {
    const n = normalizeShopifyOrderPayment({
      financial_status: "pending",
      total_price: "400",
      payment_gateway_names: ["razorpay"],
    });
    expect(n.payment).toBe("Prepaid");
  });

  it("orderCodCollectableAmount prefers persisted remainder", () => {
    expect(
      orderCodCollectableAmount({
        payment: "COD",
        amount: 1000,
        codCollectableAmount: 700,
      })
    ).toBe(700);
    expect(orderCodCollectableAmount({ payment: "Prepaid", amount: 1000 })).toBe(0);
  });

  it("orderCodCollectableAmount falls back to amountOutstanding when collectable unset", () => {
    expect(
      orderCodCollectableAmount({
        payment: "COD",
        amount: 1000,
        amountOutstanding: 700,
      })
    ).toBe(700);
  });
});

describe("resolveManualOrderPaymentFields", () => {
  it("full prepaid", () => {
    const n = resolveManualOrderPaymentFields({ payment: "Prepaid", amount: 1000 });
    expect(n).toMatchObject({
      payment: "Prepaid",
      amount: 1000,
      amountPaid: 1000,
      amountOutstanding: 0,
      codCollectableAmount: 0,
      isFullyPrepaid: true,
    });
  });

  it("full COD", () => {
    const n = resolveManualOrderPaymentFields({ payment: "COD", amount: 1000 });
    expect(n).toMatchObject({
      payment: "COD",
      amount: 1000,
      amountPaid: 0,
      codCollectableAmount: 1000,
      isPartiallyPaid: false,
    });
  });

  it("partial COD keeps invoice amount and collectable remainder", () => {
    const n = resolveManualOrderPaymentFields({
      payment: "COD",
      amount: 1000,
      codCollectableAmount: 700,
    });
    expect(n).toMatchObject({
      payment: "COD",
      amount: 1000,
      amountPaid: 300,
      amountOutstanding: 700,
      codCollectableAmount: 700,
      isPartiallyPaid: true,
      isFullyPrepaid: false,
    });
  });
});
