import { beforeEach, describe, expect, it, vi } from "vitest";

const findOne = vi.fn();
const findOneAndUpdate = vi.fn();
const updateOne = vi.fn(async () => ({ acknowledged: true }));

vi.mock("../../models/Order.js", () => ({
  Order: {
    findOne: (...args: unknown[]) => findOne(...args),
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
    updateOne: (...args: unknown[]) => updateOne(...args),
  },
}));

vi.mock("../lorrigo/lorrigo.bookingMetrics.js", () => ({
  recordDuplicateBookingAttempt: vi.fn(),
}));

describe("claimOrderForBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns reusedExisting when order already booked", async () => {
    const { claimOrderForBooking } = await import("./bookingClaim.js");
    findOne.mockResolvedValueOnce({
      orderId: "ORD-1",
      shipmentCreated: true,
      awb: "AWB1",
      bookingIdempotencyKey: "lorrigo:ORD-1",
    });

    const r = await claimOrderForBooking({ orderId: "ORD-1", provider: "lorrigo" });
    expect(r.reusedExisting).toBe(true);
    expect(r.order.awb).toBe("AWB1");
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("acquires atomic claim for open order", async () => {
    const { claimOrderForBooking } = await import("./bookingClaim.js");
    findOne.mockResolvedValueOnce({
      orderId: "ORD-2",
      shipmentCreated: false,
      awb: "",
    });
    findOneAndUpdate.mockResolvedValueOnce({
      orderId: "ORD-2",
      shipmentCreated: false,
      awb: "",
      bookingInProgress: true,
      bookingIdempotencyKey: "lorrigo:ORD-2",
    });

    const r = await claimOrderForBooking({ orderId: "ORD-2", provider: "lorrigo" });
    expect(r.reusedExisting).toBe(false);
    expect(r.order.bookingInProgress).toBe(true);
    expect(findOneAndUpdate).toHaveBeenCalled();
  });

  it("rejects race when another worker holds the claim", async () => {
    const { claimOrderForBooking } = await import("./bookingClaim.js");
    findOne
      .mockResolvedValueOnce({
        orderId: "ORD-3",
        shipmentCreated: false,
        awb: "",
      })
      .mockResolvedValueOnce({
        orderId: "ORD-3",
        shipmentCreated: false,
        awb: "",
        bookingInProgress: true,
      });
    findOneAndUpdate.mockResolvedValueOnce(null);

    await expect(
      claimOrderForBooking({ orderId: "ORD-3", provider: "lorrigo" })
    ).rejects.toThrow(/already in progress/i);
  });
});
