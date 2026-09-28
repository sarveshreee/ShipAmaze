import { beforeEach, describe, expect, it, vi } from "vitest";

const putMock = vi.fn();
const cancelMock = vi.fn();

vi.mock("./ekart.client.js", () => ({
  ekartPut: (...args: unknown[]) => putMock(...args),
}));

vi.mock("./ekart.cancel.js", () => ({
  cancelEkartShipment: (...args: unknown[]) => cancelMock(...args),
}));

vi.mock("./ekart.config.js", () => ({
  ekartConfig: {
    updateShipmentEndpoint: "/v2/shipments/update_shipment",
  },
}));

import {
  ekartIstYmdPlusDays,
  normalizeEkartNdrRescheduleDate,
  performEkartNdrAction,
} from "./ekart.ndr.js";

describe("Ekart NDR actions", () => {
  beforeEach(() => {
    putMock.mockReset();
    cancelMock.mockReset();
  });

  it("normalizes next attempt to YYYY-MM-DD", () => {
    expect(normalizeEkartNdrRescheduleDate("2026-10-01T10:00:00Z")).toBe("2026-10-01");
    expect(normalizeEkartNdrRescheduleDate("")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ekartIstYmdPlusDays(0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reschedules via Durin update_shipment", async () => {
    putMock.mockResolvedValueOnce({
      response: [{ tracking_id: "TECC1", status: "REQUEST_RECEIVED", status_code: 200 }],
    });
    const r = await performEkartNdrAction({
      awb: "TECC2951467665",
      action: "reattempt",
      nextAttemptDate: "2026-09-29",
    });
    expect(r.success).toBe(true);
    expect(putMock).toHaveBeenCalledWith(
      "/v2/shipments/update_shipment",
      {
        update_request_type: "RESCHEDULE_DELIVERY_DATE",
        update_request_details: {
          updated_delivery_date: "2026-09-29",
          tracking_id: "TECC2951467665",
        },
      },
      { retryable: false }
    );
  });

  it("returns via existing RTO create", async () => {
    cancelMock.mockResolvedValueOnce({ success: true, message: "Ekart RTO request accepted" });
    const r = await performEkartNdrAction({
      awb: "TECC2951467665",
      action: "return",
      remarks: "customer refused",
    });
    expect(r.success).toBe(true);
    expect(cancelMock).toHaveBeenCalledWith({
      awbs: ["TECC2951467665"],
      reason: "customer refused",
      serviceLeg: "FORWARD",
    });
  });
});
