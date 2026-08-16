import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { applyDefaultTestEnv } from "../../test/testEnv.js";
import type { IOrder } from "../../models/Order.js";

applyDefaultTestEnv();

vi.mock("../../models/Order.js", () => ({
  Order: {
    updateOne: vi.fn(async () => ({ acknowledged: true })),
  },
}));

import {
  isPartnerOrderSuccessfullyBooked,
  releasePartnerReferenceAfterFailedBooking,
} from "./partnerReferenceLifecycle.js";

function makeOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    orderId: "SP-REF-1",
    partnerId: new Types.ObjectId(),
    partnerReferenceId: "ORDER-100",
    status: "ready_to_ship",
    save: vi.fn(async () => undefined),
    ...overrides,
  } as IOrder;
}

describe("partnerReferenceLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects successful booking via AWB or shipmentCreated", () => {
    expect(isPartnerOrderSuccessfullyBooked(makeOrder({ awb: "AWB1" }))).toBe(true);
    expect(isPartnerOrderSuccessfullyBooked(makeOrder({ shipmentCreated: true }))).toBe(true);
    expect(isPartnerOrderSuccessfullyBooked(makeOrder())).toBe(false);
  });

  it("releases reference on clear failure", async () => {
    const order = makeOrder();
    await releasePartnerReferenceAfterFailedBooking(order, "test failure");
    expect(order.partnerReferenceArchived).toBe("ORDER-100");
    expect(order.partnerReferenceId).toBeUndefined();
    expect(order.save).toHaveBeenCalled();
  });

  it("does not release reference when booked", async () => {
    const order = makeOrder({ awb: "AWB1", shipmentCreated: true });
    await releasePartnerReferenceAfterFailedBooking(order);
    expect(order.partnerReferenceId).toBe("ORDER-100");
    expect(order.partnerReferenceArchived).toBeUndefined();
  });

  it("does not release reference when uncertain", async () => {
    const order = makeOrder({ bookingReconciliationRequired: true });
    await releasePartnerReferenceAfterFailedBooking(order);
    expect(order.partnerReferenceId).toBe("ORDER-100");
  });
});
