import { beforeEach, describe, expect, it, vi } from "vitest";

const putMock = vi.fn();

vi.mock("./ekart.client.js", () => ({
  ekartPut: (...args: unknown[]) => putMock(...args),
}));

vi.mock("./ekart.config.js", () => ({
  ekartConfig: {
    rtoCreateEndpoint: "/v3/shipments/rto/create",
    cancelRvpEndpoint: "/v3/shipments/cancel_rvp",
    get cancelEnabled() {
      return process.env.EKART_CANCEL_ENABLED === "true";
    },
  },
}));

import {
  cancelEkartShipment,
  isEkartAlreadyCancelledMessage,
  isEkartReverseTrackingId,
  resolveEkartCancelLeg,
} from "./ekart.cancel.js";

describe("Ekart cancel / RTO / RVP", () => {
  beforeEach(() => {
    putMock.mockReset();
    process.env.EKART_CANCEL_ENABLED = "true";
  });

  it("treats already-in-RTO messages as success", () => {
    expect(isEkartAlreadyCancelledMessage("Unable to RTO shipment as it is already in RTO")).toBe(
      true
    );
  });

  it("does not call Durin when EKART_CANCEL_ENABLED is false", async () => {
    process.env.EKART_CANCEL_ENABLED = "false";
    await expect(
      cancelEkartShipment({ awbs: ["TECP0000000001"], serviceLeg: "FORWARD" })
    ).rejects.toThrow(/EKART_CANCEL_ENABLED/);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("detects reverse tracking ids (4th char R)", () => {
    expect(isEkartReverseTrackingId("TECR0000000001")).toBe(true);
    expect(isEkartReverseTrackingId("TECP0000000001")).toBe(false);
  });

  it("routes FORWARD cancel to RTO create with tracking_id", async () => {
    putMock.mockResolvedValue({
      request_id: "r1",
      response: [{ merchant_reference_id: "TECP1", status: "REQUEST_RECEIVED", status_code: 200 }],
    });

    const r = await cancelEkartShipment({
      awbs: ["TECP0000000001"],
      reason: "customer_request",
      serviceLeg: "FORWARD",
    });

    expect(r.success).toBe(true);
    expect(putMock).toHaveBeenCalledWith(
      "/v3/shipments/rto/create",
      expect.objectContaining({
        request_details: [
          expect.objectContaining({
            tracking_id: "TECP0000000001",
            reason: "customer_request",
          }),
        ],
      }),
      expect.any(Object)
    );
  });

  it("routes REVERSE cancel to Cancel RVP", async () => {
    putMock.mockResolvedValue({
      request_id: "r2",
      response: [{ merchant_reference_id: "MR1", status: "REQUEST_RECEIVED", status_code: 200 }],
    });

    const r = await cancelEkartShipment({
      awbs: ["TECR0000000001"],
      merchantReferenceId: "ORD123",
      serviceLeg: "REVERSE",
    });

    expect(r.success).toBe(true);
    expect(resolveEkartCancelLeg({ awbs: ["TECR0000000001"] })).toBe("REVERSE");
    expect(putMock).toHaveBeenCalledWith(
      "/v3/shipments/cancel_rvp",
      expect.objectContaining({
        tracking_id: "TECR0000000001",
        merchant_reference_id: "ORD123",
      }),
      expect.any(Object)
    );
  });

  it("returns success:false when Durin rejects", async () => {
    putMock.mockResolvedValue({
      response: [{ status: "REQUEST_REJECTED", message: ["not allowed"] }],
    });
    const r = await cancelEkartShipment({ awbs: ["TECP0000000001"] });
    expect(r.success).toBe(false);
    expect(r.message).toContain("not allowed");
  });
});
