import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pickupToLorrigoPickupPayload,
  syncPickupToLorrigo,
} from "./lorrigo.pickupSync.js";
import { resetLorrigoClientForTests } from "./lorrigo.client.js";

const originalEnv = { ...process.env };

vi.mock("../../models/Pickup.js", () => {
  const store = new Map<string, Record<string, unknown>>();
  return {
    Pickup: {
      __store: store,
      findById: vi.fn(async (id: string) => {
        const row = store.get(String(id));
        if (!row) return null;
        return {
          ...row,
          save: vi.fn(async function save(this: Record<string, unknown>) {
            store.set(String(this._id), { ...this, save: row.save });
          }),
        };
      }),
    },
  };
});

vi.mock("../../models/User.js", () => ({
  User: {
    findById: vi.fn(() => ({
      select: () => ({
        lean: async () => ({ email: "owner@shipamaze.test" }),
      }),
    })),
  },
}));

vi.mock("./lorrigo.client.js", async () => {
  const actual = await vi.importActual<typeof import("./lorrigo.client.js")>("./lorrigo.client.js");
  return {
    ...actual,
    lorrigoPost: vi.fn(),
  };
});

import { Pickup } from "../../models/Pickup.js";
import { lorrigoPost } from "./lorrigo.client.js";

function seedPickup(overrides: Record<string, unknown> = {}) {
  const id = "507f1f77bcf86cd799439011";
  const row = {
    _id: id,
    userId: "507f1f77bcf86cd799439099",
    label: "Main WH",
    contactName: "Ada",
    phone: "9876543210",
    email: "wh@test.com",
    addressLine1: "1 Street",
    addressLine2: "",
    city: "Delhi",
    state: "Delhi",
    pincode: "110001",
    country: "India",
    deletedAt: undefined,
    lorrigoPickupId: undefined,
    lorrigoSyncStatus: undefined,
    lorrigoSyncError: undefined,
    ...overrides,
  };
  (Pickup as unknown as { __store: Map<string, unknown> }).__store.set(id, row);
  return id;
}

describe("lorrigo pickup sync", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    resetLorrigoClientForTests();
    (Pickup as unknown as { __store: Map<string, unknown> }).__store.clear();
    vi.mocked(lorrigoPost).mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("maps pickup fields to Lorrigo payload", () => {
    const body = pickupToLorrigoPickupPayload(
      {
        label: "Hub",
        contactName: "Sam",
        phone: "9876543210",
        email: "",
        addressLine1: "A1",
        addressLine2: "A2",
        city: "Surat",
        state: "Gujarat",
        pincode: "395003",
      },
      "fallback@test.com"
    );
    expect(body.facilityName).toBe("Hub");
    expect(body.email).toBe("fallback@test.com");
    expect(body.pincode).toBe("395003");
    // Lorrigo requires `/` or `-` in address + RTO fields
    expect(body.address).toContain("-");
    expect(body.rtoAddress).toBe(body.address);
    expect(body.rtoPincode).toBe("395003");
  });

  it("keeps addresses that already contain / or -", () => {
    const body = pickupToLorrigoPickupPayload(
      {
        label: "Hub",
        contactName: "Sam",
        phone: "9876543210",
        addressLine1: "opp-matchiswala market",
        city: "Surat",
        state: "Gujarat",
        pincode: "395003",
      },
      "fallback@test.com"
    );
    expect(body.address).toBe("opp-matchiswala market");
  });

  it("sanitizes special characters for Lorrigo without changing local meaning", () => {
    const body = pickupToLorrigoPickupPayload(
      {
        label: "NIMA TRADERS #1",
        contactName: "Rohit / Admin",
        phone: "9876543210",
        addressLine1:
          "PADAL ROAD\\SUB LOCALITY:HADAPSAR, PUNE DIST. PUNE STATE MAHARASTRA PIN CODE 411028",
        addressLine2: "Near Blue Kamti Society!",
        city: "PUNE",
        state: "MAHARASTRA",
        pincode: "411028",
      },
      "a@b.com"
    );
    expect(body.facilityName).toMatch(/^[A-Za-z0-9 _-]+$/);
    expect(body.contactPersonName).toMatch(/^[A-Za-z0-9 _-]+$/);
    expect(body.address).toMatch(/^[A-Za-z0-9 _/-]+$/);
    expect(body.address2).toMatch(/^[A-Za-z0-9 _-]*$/);
    expect(body.address).toContain("-");
    expect(body.facilityName).toContain("NIMA TRADERS");
    expect(body.address.toLowerCase()).toContain("padal road");
  });

  it("bypasses sync when LORRIGO_ENABLED=false", async () => {
    process.env.LORRIGO_ENABLED = "false";
    process.env.LORRIGO_EMAIL = "a@b.com";
    process.env.LORRIGO_PASSWORD = "x";
    const id = seedPickup();
    const result = await syncPickupToLorrigo(id);
    expect(result).toMatchObject({ synced: false, skipped: true });
    expect(lorrigoPost).not.toHaveBeenCalled();
  });

  it("syncs successfully and stores provider id from hub.id", async () => {
    process.env.LORRIGO_ENABLED = "true";
    process.env.LORRIGO_EMAIL = "a@b.com";
    process.env.LORRIGO_PASSWORD = "x";
    const id = seedPickup();
    vi.mocked(lorrigoPost).mockResolvedValue({
      valid: true,
      message: "Hub created successfully",
      hub: { id: "lorrigo-pickup-1", code: "LS123" },
    });

    const result = await syncPickupToLorrigo(id);
    expect(result).toMatchObject({ synced: true, pickupId: "lorrigo-pickup-1" });
    expect(lorrigoPost).toHaveBeenCalledTimes(1);

    const stored = (Pickup as unknown as { __store: Map<string, Record<string, unknown>> }).__store.get(id)!;
    expect(stored.lorrigoPickupId).toBe("lorrigo-pickup-1");
    expect(stored.lorrigoSyncStatus).toBe("SUCCESS");
  });

  it("marks FAILED on provider error without removing local pickup", async () => {
    process.env.LORRIGO_ENABLED = "true";
    process.env.LORRIGO_EMAIL = "a@b.com";
    process.env.LORRIGO_PASSWORD = "x";
    const id = seedPickup();
    vi.mocked(lorrigoPost).mockRejectedValue(new Error("upstream down"));

    const result = await syncPickupToLorrigo(id);
    expect(result).toMatchObject({ synced: false, error: expect.stringMatching(/upstream/i) });

    const stored = (Pickup as unknown as { __store: Map<string, Record<string, unknown>> }).__store.get(id)!;
    expect(stored.lorrigoPickupId).toBeUndefined();
    expect(stored.lorrigoSyncStatus).toBe("FAILED");
    expect(stored.lorrigoSyncError).toMatch(/upstream/i);
  });

  it("does not create duplicate pickups when already synced", async () => {
    process.env.LORRIGO_ENABLED = "true";
    process.env.LORRIGO_EMAIL = "a@b.com";
    process.env.LORRIGO_PASSWORD = "x";
    const id = seedPickup({
      lorrigoPickupId: "existing-id",
      lorrigoSyncStatus: "SUCCESS",
    });

    const first = await syncPickupToLorrigo(id, { force: true });
    const second = await syncPickupToLorrigo(id, { force: true });
    expect(first).toMatchObject({ synced: true, alreadySynced: true, pickupId: "existing-id" });
    expect(second).toMatchObject({ synced: true, alreadySynced: true, pickupId: "existing-id" });
    expect(lorrigoPost).not.toHaveBeenCalled();
  });

  it("retry after failure creates once then becomes idempotent", async () => {
    process.env.LORRIGO_ENABLED = "true";
    process.env.LORRIGO_EMAIL = "a@b.com";
    process.env.LORRIGO_PASSWORD = "x";
    const id = seedPickup({ lorrigoSyncStatus: "FAILED", lorrigoSyncError: "old" });
    vi.mocked(lorrigoPost).mockResolvedValue({ data: { id: "new-id" } });

    const retry = await syncPickupToLorrigo(id, { force: true });
    expect(retry).toMatchObject({ synced: true, pickupId: "new-id" });
    expect(lorrigoPost).toHaveBeenCalledTimes(1);

    const again = await syncPickupToLorrigo(id, { force: true });
    expect(again).toMatchObject({ synced: true, alreadySynced: true });
    expect(lorrigoPost).toHaveBeenCalledTimes(1);
  });
});
