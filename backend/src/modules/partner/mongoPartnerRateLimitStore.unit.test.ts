import { beforeEach, describe, expect, it, vi } from "vitest";
import { MongoPartnerRateLimitStore } from "./mongoPartnerRateLimitStore.js";

const findById = vi.fn();
const findOneAndUpdate = vi.fn();
const deleteOne = vi.fn();
const createIndexes = vi.fn().mockResolvedValue(undefined);

function mockFindByIdLean(result: unknown) {
  findById.mockReturnValue({
    lean: vi.fn().mockResolvedValue(result),
  });
}

vi.mock("../../models/PartnerRateLimitCounter.js", () => ({
  PartnerRateLimitCounter: {
    findById: (...args: unknown[]) => findById(...args),
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
    deleteOne: (...args: unknown[]) => deleteOne(...args),
    createIndexes: (...args: unknown[]) => createIndexes(...args),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
  },
}));

describe("MongoPartnerRateLimitStore", () => {
  let store: MongoPartnerRateLimitStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new MongoPartnerRateLimitStore();
    store.init({ windowMs: 60_000 });
  });

  it("creates a new bucket on first increment", async () => {
    const resetTime = new Date(Date.now() + 60_000);
    findOneAndUpdate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ hits: 1, resetTime });

    const result = await store.increment("partner-general:partner:p1:general");

    expect(result.totalHits).toBe(1);
    expect(result.resetTime).toEqual(resetTime);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
    const upsertCall = findOneAndUpdate.mock.calls[1]?.[1] as { $set?: { hits?: number } };
    expect(upsertCall.$set?.hits).toBe(1);
  });

  it("increments an existing bucket atomically", async () => {
    const resetTime = new Date(Date.now() + 60_000);
    findOneAndUpdate.mockResolvedValueOnce({ hits: 3, resetTime });

    const result = await store.increment("partner-general:partner:p1:general");

    expect(result.totalHits).toBe(3);
    const incCall = findOneAndUpdate.mock.calls[0]?.[1] as { $inc?: { hits?: number } };
    expect(incCall.$inc?.hits).toBe(1);
  });

  it("isolates different key prefixes", async () => {
    const resetTime = new Date(Date.now() + 60_000);
    findOneAndUpdate.mockResolvedValue({ hits: 1, resetTime });

    await store.increment("partner-general:partner:p1:general");
    await store.increment("partner-booking:partner:p1:booking");

    expect(findOneAndUpdate.mock.calls[0]?.[0]).toMatchObject({
      _id: "partner-general:partner:p1:general",
    });
    expect(findOneAndUpdate.mock.calls[1]?.[0]).toMatchObject({
      _id: "partner-booking:partner:p1:booking",
    });
  });

  it("returns undefined from get when bucket expired", async () => {
    mockFindByIdLean({
      hits: 5,
      resetTime: new Date(Date.now() - 1000),
    });

    const result = await store.get("partner-general:partner:p1:general");
    expect(result).toBeUndefined();
  });

  it("returns active bucket from get", async () => {
    const resetTime = new Date(Date.now() + 60_000);
    mockFindByIdLean({ hits: 4, resetTime });

    const result = await store.get("partner-general:partner:p1:general");
    expect(result?.totalHits).toBe(4);
    expect(result?.resetTime).toEqual(resetTime);
  });

  it("initializes indexes on init", () => {
    expect(createIndexes).toHaveBeenCalled();
  });

  it("decrements hits for skipSuccessfulRequests paths", async () => {
    await store.decrement("partner-auth-fail:10.0.0.1");
    const decCall = findOneAndUpdate.mock.calls[0]?.[1] as { $inc?: { hits?: number } };
    expect(decCall.$inc?.hits).toBe(-1);
  });

  it("throws on Mongo errors for passOnStoreError handling", async () => {
    findOneAndUpdate.mockRejectedValue(new Error("mongo unavailable"));
    await expect(store.increment("partner-general:partner:p1:general")).rejects.toThrow(
      "mongo unavailable"
    );
  });
});
