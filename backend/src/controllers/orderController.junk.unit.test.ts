import { describe, expect, it } from "vitest";
import { AppError } from "../middleware/errorMiddleware.js";
import { assertOrderEligibleForJunk } from "./orderController.js";

describe("assertOrderEligibleForJunk", () => {
  it("allows no-AWB channel cleanup even when internal status is blocked-looking", () => {
    expect(() =>
      assertOrderEligibleForJunk({
        isJunk: false,
        status: "cancelled",
        awb: "",
      })
    ).not.toThrow();
  });

  it("allows no-AWB shipmentCreated leftovers because AWB is the source of truth", () => {
    expect(() =>
      assertOrderEligibleForJunk({
        isJunk: false,
        status: "pending_pickup",
        awb: undefined,
      })
    ).not.toThrow();
  });

  it("blocks orders that already have an AWB", () => {
    expect(() =>
      assertOrderEligibleForJunk({
        isJunk: false,
        status: "pending",
        awb: "AWB123",
      })
    ).toThrow(AppError);
  });

  it("blocks orders already in junk", () => {
    expect(() =>
      assertOrderEligibleForJunk({
        isJunk: true,
        status: "junk",
        awb: "",
      })
    ).toThrow(AppError);
  });
});
