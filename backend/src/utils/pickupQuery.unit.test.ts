import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { applyDefaultTestEnv } from "../test/testEnv.js";
import type { IUser } from "../models/User.js";
import {
  pickupByIdOwnSelectableQuery,
  pickupOwnListQuery,
  pickupOwnerScope,
} from "./pickupQuery.js";

applyDefaultTestEnv();

function dropshipperUser(id = new Types.ObjectId()): IUser {
  return { _id: id, role: "dropshipper" } as IUser;
}

describe("pickupOwnerScope", () => {
  it("scopes dropshipper pickups to userId or dropshipperId, not vendor-linked rows", () => {
    const id = new Types.ObjectId();
    expect(pickupOwnerScope(id, "dropshipper")).toEqual({
      $or: [{ userId: id }, { dropshipperId: id }],
    });
  });

  it("scopes vendor pickups to userId only", () => {
    const id = new Types.ObjectId();
    expect(pickupOwnerScope(id, "vendor")).toEqual({ userId: id });
  });
});

describe("pickupOwnListQuery / pickupByIdOwnSelectableQuery", () => {
  it("lists only this dropshipper's added pickups", () => {
    const user = dropshipperUser();
    const q = pickupOwnListQuery(user);
    expect(q).toEqual({
      $and: [
        { $or: [{ userId: user._id }, { dropshipperId: user._id }] },
        { $or: [{ deletedAt: { $exists: false } }, { deletedAt: null }] },
        { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
      ],
    });
  });

  it("can include inactive own pickups for management lists", () => {
    const user = dropshipperUser();
    const q = pickupOwnListQuery(user, { includeInactive: true });
    expect(JSON.stringify(q)).not.toContain("isActive");
  });

  it("requires the pickup id to belong to the dropshipper", () => {
    const user = dropshipperUser();
    const pickupId = new Types.ObjectId().toString();
    const q = pickupByIdOwnSelectableQuery(pickupId, user);
    const and = (q as { $and: Record<string, unknown>[] }).$and;
    expect(and[0]).toEqual({ _id: pickupId });
    expect(and[1]).toEqual({ $or: [{ userId: user._id }, { dropshipperId: user._id }] });
  });
});
