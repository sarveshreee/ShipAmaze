import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("../../models/Pickup.js", () => {
  const store = new Map<string, Record<string, unknown>>();
  return {
    Pickup: {
      findById: vi.fn(async (id: string) => {
        const row = store.get(String(id));
        if (!row) return null;
        return {
          ...row,
          save: async function (this: Record<string, unknown>) {
            store.set(String(id), { ...this });
            return this;
          },
        };
      }),
      __store: store,
    },
  };
});

vi.mock("./ekart.config.js", () => ({
  isEkartEnabledFlag: () => true,
  isEkartConfigured: () => true,
  ekartConfig: { defaultLocationCode: "" },
}));

import { Pickup } from "../../models/Pickup.js";
import {
  linkPickupToEkart,
  unlinkPickupFromEkart,
  validateEkartLocationCode,
  normalizeEkartLocationCode,
} from "./ekart.pickupSync.js";

const store = (Pickup as unknown as { __store: Map<string, Record<string, unknown>> }).__store;

describe("ekart.pickupSync", () => {
  beforeEach(() => {
    store.clear();
    store.set("507f1f77bcf86cd799439011", {
      _id: "507f1f77bcf86cd799439011",
      label: "KESAR",
      deletedAt: undefined,
    });
  });

  it("validates location codes", () => {
    expect(validateEkartLocationCode("")).toMatch(/required/i);
    expect(validateEkartLocationCode("TEC_SUR_01")).toBe("");
    expect(validateEkartLocationCode("395003")).toMatch(/pincode/i);
    expect(validateEkartLocationCode("123456")).toMatch(/pincode/i);
    expect(normalizeEkartLocationCode(" TEC SUR ")).toBe("TEC_SUR");
  });

  it("rejects pincode link attempts", async () => {
    const r = await linkPickupToEkart("507f1f77bcf86cd799439011", "395003");
    expect(r.synced).toBe(false);
    if (!r.synced && "error" in r) expect(r.error).toMatch(/pincode/i);
    expect(store.get("507f1f77bcf86cd799439011")?.ekartLocationCode).toBeUndefined();
  });

  it("links Elite location code onto pickup", async () => {
    const r = await linkPickupToEkart("507f1f77bcf86cd799439011", "TEC_SUR_01");
    expect(r).toEqual({ synced: true, locationCode: "TEC_SUR_01" });
    const row = store.get("507f1f77bcf86cd799439011");
    expect(row?.ekartLocationCode).toBe("TEC_SUR_01");
    expect(row?.ekartSyncStatus).toBe("SUCCESS");
  });

  it("unlinks location code", async () => {
    await linkPickupToEkart("507f1f77bcf86cd799439011", "TEC_SUR_01");
    const r = await unlinkPickupFromEkart("507f1f77bcf86cd799439011");
    expect(r.synced).toBe(true);
    expect(store.get("507f1f77bcf86cd799439011")?.ekartLocationCode).toBeUndefined();
  });
});
