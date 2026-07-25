import { describe, it, expect } from "vitest";
import {
  normalizeProviderNdrAction,
  resolveNdrProviderId,
  supportedNdrActions,
} from "./ndrActions.js";
import { appendProviderEvent } from "./providerEvents.js";
import type { IOrder } from "../../models/Order.js";

describe("ndrActions helpers", () => {
  it("resolves provider id with velocity default", () => {
    expect(resolveNdrProviderId(undefined)).toBe("velocity");
    expect(resolveNdrProviderId("lorrigo")).toBe("lorrigo");
  });

  it("lists supported actions per provider", () => {
    expect(supportedNdrActions("velocity")).toEqual(["reattempt", "return"]);
    expect(supportedNdrActions("lorrigo")).toEqual(["reattempt", "return", "fake-attempt"]);
  });

  it("normalizes action aliases", () => {
    expect(normalizeProviderNdrAction("Force RTO", "velocity")).toBe("return");
    expect(normalizeProviderNdrAction("re_attempt", "lorrigo")).toBe("reattempt");
  });
});

describe("NDR timeline events", () => {
  it("appends NDR_RECEIVED / NDR_ACTION / NDR_RESOLVED without overwriting history", () => {
    const order = {
      providerEvents: [
        { provider: "lorrigo", type: "BOOKING_RESPONSE", timestamp: new Date() },
      ],
      markModified() {},
    } as unknown as IOrder;

    appendProviderEvent(order, {
      provider: "lorrigo",
      type: "NDR_RECEIVED",
      status: "SUCCESS",
      message: "Customer unavailable",
      metadata: { fingerprint: "abc" },
    });
    appendProviderEvent(order, {
      provider: "lorrigo",
      type: "NDR_ACTION",
      status: "SUCCESS",
      message: "reattempt",
    });
    appendProviderEvent(order, {
      provider: "lorrigo",
      type: "NDR_RESOLVED",
      status: "SUCCESS",
      message: "return",
    });

    expect(order.providerEvents).toHaveLength(4);
    expect(order.providerEvents?.map((e) => e.type)).toEqual([
      "BOOKING_RESPONSE",
      "NDR_RECEIVED",
      "NDR_ACTION",
      "NDR_RESOLVED",
    ]);
  });
});
