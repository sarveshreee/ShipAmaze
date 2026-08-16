import { describe, expect, it } from "vitest";
import { COD_METRIC_DEFINITIONS, collectableFromOrderRow } from "./codMetrics.js";

describe("codMetrics", () => {
  it("defines four distinct finance metrics", () => {
    const keys = Object.keys(COD_METRIC_DEFINITIONS);
    expect(keys).toContain("dashboardUndeliveredCODAmount");
    expect(keys).toContain("walletPendingRemittanceAmount");
    expect(keys).toContain("remittancePendingAmount");
    expect(keys).toContain("payoutPendingAmount");
  });

  it("collectable prefers codCollectableAmount", () => {
    expect(
      collectableFromOrderRow({
        payment: "COD",
        amount: 1000,
        codCollectableAmount: 700,
      })
    ).toBe(700);
  });

  it("collectable falls back to amountOutstanding", () => {
    expect(
      collectableFromOrderRow({
        payment: "COD",
        amount: 1000,
        amountOutstanding: 700,
      })
    ).toBe(700);
  });
});
