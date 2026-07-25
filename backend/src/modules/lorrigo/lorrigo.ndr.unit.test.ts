import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  mapLorrigoOrderToNdrRecord,
  lorrigoSupportedNdrActions,
  fetchLorrigoNdr,
  performLorrigoNdrAction,
} from "./lorrigo.ndr.js";
import {
  getLorrigoNdrMetrics,
  resetLorrigoNdrMetricsForTests,
  recordNdrDuplicateSuppressed,
} from "./lorrigo.ndrMetrics.js";
import { getLorrigoNdrSyncIntervalMs } from "./lorrigo.ndrSync.js";
import {
  normalizeProviderNdrAction,
  supportedNdrActions,
} from "../courier/ndrActions.js";

vi.mock("./lorrigo.client.js", () => ({
  lorrigoGet: vi.fn(),
  lorrigoPost: vi.fn(),
}));

import { lorrigoGet, lorrigoPost } from "./lorrigo.client.js";

describe("lorrigo NDR normalize + actions", () => {
  beforeEach(() => {
    resetLorrigoNdrMetricsForTests();
    vi.clearAllMocks();
  });

  it("maps provider order rows into the shared NDR model", () => {
    const mapped = mapLorrigoOrderToNdrRecord({
      awb: "LRG123",
      ndrReason: "Customer not available",
      status: "NDR",
      customerRemarks: "Call after 6pm",
      deliveryDetails: { fullName: "Ada", mobileNumber: "9999999999" },
      orderId: "ORD-1",
      courierName: "Delhivery",
      attempts: 2,
    });
    expect(mapped).toMatchObject({
      provider: "lorrigo",
      awb: "LRG123",
      reason: "Customer not available",
      actionRequired: true,
      recommendedAction: "reattempt",
      providerStatus: "NDR",
      customerRemarks: "Call after 6pm",
      customerName: "Ada",
      phone: "9999999999",
      orderId: "ORD-1",
      carrier: "Delhivery",
      attempts: 2,
    });
  });

  it("exposes only supported NDR actions for Lorrigo", () => {
    expect(lorrigoSupportedNdrActions()).toEqual(["reattempt", "return", "fake-attempt"]);
    expect(supportedNdrActions("lorrigo")).toContain("fake-attempt");
    expect(supportedNdrActions("velocity")).not.toContain("fake-attempt");
  });

  it("normalizes rto alias to return and rejects unsupported fake-attempt on Velocity", () => {
    expect(normalizeProviderNdrAction("rto", "velocity")).toBe("return");
    expect(normalizeProviderNdrAction("fake-attempt", "lorrigo")).toBe("fake-attempt");
    expect(() => normalizeProviderNdrAction("fake-attempt", "velocity")).toThrow(/not supported/i);
  });

  it("fetchNDR records metrics and returns normalized rows", async () => {
    vi.mocked(lorrigoGet).mockResolvedValueOnce({
      data: [{ awb: "A1", ndrReason: "Rejected", status: "NDR" }],
    });
    const rows = await fetchLorrigoNdr({ daysBack: 7, page: 1, limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.awb).toBe("A1");
    const m = getLorrigoNdrMetrics();
    expect(m.fetchCalls).toBe(1);
    expect(m.ndrCount).toBe(1);
  });

  it("records provider failure metrics when fetch fails", async () => {
    vi.mocked(lorrigoGet).mockRejectedValueOnce(new Error("upstream 503"));
    await expect(fetchLorrigoNdr()).rejects.toThrow(/503/);
    expect(getLorrigoNdrMetrics().providerFailures).toBe(1);
  });

  it("performNDRAction posts actionType and tracks latency/resolutions", async () => {
    vi.mocked(lorrigoPost).mockResolvedValueOnce({ message: "ok" });
    const res = await performLorrigoNdrAction({
      awb: "A1",
      action: "return",
      remarks: "RTO",
    });
    expect(res.success).toBe(true);
    expect(lorrigoPost).toHaveBeenCalledWith(
      "/v2/ndr/action",
      expect.objectContaining({ ndrId: "A1", actionType: "return" })
    );
    const m = getLorrigoNdrMetrics();
    expect(m.actionSuccesses).toBe(1);
    expect(m.successfulResolutions).toBe(1);
    expect(m.lastActionLatencyMs).toBeTypeOf("number");
  });

  it("tracks duplicate suppression metrics", () => {
    recordNdrDuplicateSuppressed();
    recordNdrDuplicateSuppressed();
    expect(getLorrigoNdrMetrics().duplicateSuppressions).toBe(2);
  });

  it("uses configurable NDR polling interval with a 60s floor", () => {
    const prev = process.env.LORRIGO_NDR_SYNC_INTERVAL_MS;
    process.env.LORRIGO_NDR_SYNC_INTERVAL_MS = "1000";
    expect(getLorrigoNdrSyncIntervalMs()).toBe(10 * 60 * 1000);
    process.env.LORRIGO_NDR_SYNC_INTERVAL_MS = "120000";
    expect(getLorrigoNdrSyncIntervalMs()).toBe(120000);
    if (prev === undefined) delete process.env.LORRIGO_NDR_SYNC_INTERVAL_MS;
    else process.env.LORRIGO_NDR_SYNC_INTERVAL_MS = prev;
  });
});
