import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyDefaultTestEnv } from "../test/testEnv.js";
import type { IOrder } from "../models/Order.js";
import { Types } from "mongoose";

applyDefaultTestEnv();

const assertWalletBalanceAtLeast = vi.fn();
const debitShipmentChargeIfApplicable = vi.fn();
const resolveBillableShippingCharge = vi.fn();

const orderShouldDebitWallet = vi.fn((order: IOrder) => Boolean(order.dropshipperId));

vi.mock("./walletLedger.js", () => ({
  orderShouldDebitWallet: (order: IOrder) => orderShouldDebitWallet(order),
  orderWalletUserId: (order: IOrder) => order.dropshipperId ?? order.ownerUserId ?? null,
  assertWalletBalanceAtLeast: (...args: unknown[]) => assertWalletBalanceAtLeast(...args),
  debitShipmentChargeIfApplicable: (...args: unknown[]) => debitShipmentChargeIfApplicable(...args),
}));

vi.mock("../models/Order.js", () => ({
  Order: {
    updateOne: vi.fn(async () => ({ acknowledged: true })),
  },
}));

vi.mock("./billableShippingCharge.js", () => ({
  resolveBillableShippingCharge: (...args: unknown[]) => resolveBillableShippingCharge(...args),
}));

import {
  precheckOrderShipmentWallet,
  debitOrderShipmentAfterBooking,
  attemptAndTrackShipmentWalletDebit,
} from "./shipmentWallet.js";
import { AppError } from "../middleware/errorMiddleware.js";

function makeOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    orderId: "SP-TEST-1",
    courierName: "Ekart",
    courier: "Ekart",
    weight: "0.5",
    shippingCharges: 45,
    dropshipperId: new Types.ObjectId(),
    ownerUserId: new Types.ObjectId(),
  } as IOrder;
}

describe("shipmentWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveBillableShippingCharge.mockResolvedValue({ total: 50 });
    debitShipmentChargeIfApplicable.mockResolvedValue({
      applied: true,
      amount: 45,
      txnId: "TXN-1",
      balanceAfter: 100,
    });
  });

  it("precheck skips when order is not dropshipper-billable", async () => {
    orderShouldDebitWallet.mockReturnValueOnce(false);
    const order = makeOrder();
    await precheckOrderShipmentWallet(order);
    expect(assertWalletBalanceAtLeast).not.toHaveBeenCalled();
  });

  it("precheck calls assertWalletBalanceAtLeast with billable total", async () => {
    const order = makeOrder();
    await precheckOrderShipmentWallet(order);
    expect(assertWalletBalanceAtLeast).toHaveBeenCalledWith(order.dropshipperId, 50);
  });

  it("precheck throws 402 when balance insufficient", async () => {
    assertWalletBalanceAtLeast.mockRejectedValue(new AppError(402, "Insufficient wallet balance"));
    const order = makeOrder();
    await expect(precheckOrderShipmentWallet(order)).rejects.toMatchObject({ statusCode: 402 });
  });

  it("debit uses debitShipmentChargeIfApplicable with shipment reference", async () => {
    const order = makeOrder();
    const r = await debitOrderShipmentAfterBooking(order, 40);
    expect(r.applied).toBe(true);
    expect(debitShipmentChargeIfApplicable).toHaveBeenCalledWith({
      order,
      shippingCharges: 45,
    });
  });

  it("debit returns duplicate without throwing on idempotent replay", async () => {
    debitShipmentChargeIfApplicable.mockResolvedValue({ applied: false, reason: "duplicate" });
    const order = makeOrder();
    const r = await debitOrderShipmentAfterBooking(order);
    expect(r).toEqual({ applied: false, reason: "duplicate" });
  });

  it("attemptAndTrack marks walletDebitPending on debit failure", async () => {
    debitShipmentChargeIfApplicable.mockResolvedValue({ applied: false, reason: "insufficient" });
    const order = makeOrder();
    const r = await attemptAndTrackShipmentWalletDebit(order);
    expect(r.applied).toBe(false);
    expect(order.walletDebitPending).toBe(true);
    expect(order.walletDebitFailedAt).toBeInstanceOf(Date);
  });
});
