import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { applyDefaultTestEnv } from "../../test/testEnv.js";
import type { IPartner } from "../../models/Partner.js";

applyDefaultTestEnv();

const pickupFindOne = vi.fn();
const userFindById = vi.fn();
const vendorFind = vi.fn(() => ({
  select: () => ({
    lean: async () => [],
  }),
}));

vi.mock("../../models/Pickup.js", () => ({
  Pickup: {
    findOne: (...args: unknown[]) => pickupFindOne(...args),
  },
}));

vi.mock("../../models/User.js", () => ({
  User: {
    findById: (...args: unknown[]) => userFindById(...args),
  },
}));

vi.mock("../../models/Vendor.js", () => ({
  Vendor: {
    find: (...args: unknown[]) => vendorFind(...args),
  },
}));

import { assertPartnerPickupAccess, assertPartnerLorrigoPickupSynced } from "./partnerPickupService.js";

const linkedUserId = new Types.ObjectId();

function makePartner(overrides: Partial<IPartner> = {}): IPartner {
  return {
    _id: new Types.ObjectId(),
    linkedUserId,
    allowedProviders: ["ekart"],
    ...overrides,
  } as IPartner;
}

describe("assertPartnerPickupAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindById.mockResolvedValue({
      _id: linkedUserId,
      role: "dropshipper",
    });
  });

  it("allows pickup owned by linked user userId", async () => {
    const pickupId = new Types.ObjectId();
    pickupFindOne.mockResolvedValue({ _id: pickupId, userId: linkedUserId });
    const pickup = await assertPartnerPickupAccess(makePartner(), String(pickupId));
    expect(String(pickup._id)).toBe(String(pickupId));
    const query = pickupFindOne.mock.calls[0]?.[0] as { $and: unknown[] };
    expect(JSON.stringify(query)).toContain("dropshipperId");
  });

  it("allows pickup owned via dropshipperId", async () => {
    const pickupId = new Types.ObjectId();
    pickupFindOne.mockResolvedValue({ _id: pickupId, dropshipperId: linkedUserId });
    await assertPartnerPickupAccess(makePartner(), String(pickupId));
    expect(pickupFindOne).toHaveBeenCalled();
  });

  it("rejects unrelated pickup", async () => {
    pickupFindOne.mockResolvedValue(null);
    await expect(
      assertPartnerPickupAccess(makePartner(), String(new Types.ObjectId()))
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("enforces allowedPickupIds when configured", async () => {
    const allowedId = new Types.ObjectId();
    const otherId = new Types.ObjectId();
    pickupFindOne.mockResolvedValue({ _id: otherId });
    const partner = makePartner({ allowedPickupIds: [allowedId] });
    await expect(assertPartnerPickupAccess(partner, String(otherId))).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe("assertPartnerLorrigoPickupSynced", () => {
  it("skips for non-lorrigo providers", async () => {
    await assertPartnerLorrigoPickupSynced("ekart", { _id: new Types.ObjectId() } as never);
  });

  it("rejects unsynced lorrigo pickup", async () => {
    await expect(
      assertPartnerLorrigoPickupSynced("lorrigo", { lorrigoPickupId: "" } as never)
    ).rejects.toMatchObject({ statusCode: 422, code: "PICKUP_NOT_SYNCED" });
  });

  it("allows synced lorrigo pickup", async () => {
    await assertPartnerLorrigoPickupSynced("lorrigo", {
      lorrigoPickupId: "LP-1",
      lorrigoSyncStatus: "SYNCED",
    } as never);
  });
});
