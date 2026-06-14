import mongoose from "mongoose";
import {
  collectPickupMongoCandidateIds,
  resolvePayloadWarehouseId,
} from "./velocity.warehouseMerge.js";

describe("collectPickupMongoCandidateIds", () => {
  const pickupA = new mongoose.Types.ObjectId().toString();
  const pickupB = new mongoose.Types.ObjectId().toString();

  it("prefers body warehouseId before order pickupAddressId", () => {
    const ids = collectPickupMongoCandidateIds(
      { warehouseId: pickupA },
      { pickupAddressId: pickupB }
    );
    expect(ids).toEqual([pickupA, pickupB]);
  });

  it("dedupes identical ids across body and order", () => {
    const ids = collectPickupMongoCandidateIds(
      { warehouseId: pickupA, pickupWarehouseId: pickupA },
      { pickupAddressId: pickupA, pickupWarehouseId: pickupA }
    );
    expect(ids).toEqual([pickupA]);
  });

  it("skips invalid mongo ids", () => {
    const ids = collectPickupMongoCandidateIds(
      { warehouseId: "not-an-id", pickupWarehouseId: pickupA },
      null
    );
    expect(ids).toEqual([pickupA]);
  });
});

describe("resolvePayloadWarehouseId", () => {
  it("uses merged warehouse_id when set", () => {
    expect(
      resolvePayloadWarehouseId({ warehouse_id: "WHZBRR" }, { velocityWarehouseId: "WHBRR" } as never)
    ).toBe("WHZBRR");
  });

  it("does not fall back to stale order code when pickup ref exists", () => {
    const order = {
      velocityWarehouseId: "WHBRR",
      pickupAddressId: new mongoose.Types.ObjectId(),
    };
    expect(resolvePayloadWarehouseId({}, order as never)).toBe("");
  });

  it("falls back to order velocityWarehouseId when no pickup ref", () => {
    expect(resolvePayloadWarehouseId({}, { velocityWarehouseId: "WHBRR" } as never)).toBe("WHBRR");
  });
});
