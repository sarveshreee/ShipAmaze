import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { applyDefaultTestEnv } from "../test/testEnv.js";
import type { IOrder } from "../models/Order.js";

applyDefaultTestEnv();

const orderFind = vi.fn();
const attemptAndTrackShipmentWalletDebit = vi.fn();

vi.mock("../models/Order.js", () => ({
  Order: {
    find: (...args: unknown[]) => orderFind(...args),
  },
}));

vi.mock("../modules/partner/partnerConfig.js", () => ({
  isPartnerWalletBillingEnabled: () => true,
}));

vi.mock("./shipmentWallet.js", () => ({
  attemptAndTrackShipmentWalletDebit: (...args: unknown[]) =>
    attemptAndTrackShipmentWalletDebit(...args),
  markShipmentWalletDebitPending: vi.fn(),
}));

vi.mock("./walletLedger.js", () => ({
  orderShouldDebitWallet: (order: IOrder) => Boolean(order.dropshipperId),
}));

import { reconcilePendingWalletDebits } from "./walletDebitReconciliation.js";

describe("walletDebitReconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debits pending orders with AWB", async () => {
    const order = {
      orderId: "SP-W-1",
      awb: "AWB1",
      dropshipperId: new Types.ObjectId(),
      partnerId: new Types.ObjectId(),
      walletDebitPending: true,
      save: vi.fn(async () => undefined),
    } as unknown as IOrder;

    orderFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([order]),
      }),
    });

    attemptAndTrackShipmentWalletDebit.mockResolvedValue({ applied: true, amount: 50 });

    const r = await reconcilePendingWalletDebits(10);
    expect(r.debited).toBe(1);
    expect(attemptAndTrackShipmentWalletDebit).toHaveBeenCalledOnce();
  });

  it("skips orders still awaiting AWB", async () => {
    const order = {
      orderId: "SP-W-2",
      awb: "",
      shipmentCreated: false,
      dropshipperId: new Types.ObjectId(),
      walletDebitPending: true,
      save: vi.fn(async () => undefined),
    } as unknown as IOrder;

    orderFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([order]),
      }),
    });

    const r = await reconcilePendingWalletDebits(10);
    expect(r.stillPending).toBe(1);
    expect(attemptAndTrackShipmentWalletDebit).not.toHaveBeenCalled();
  });
});
