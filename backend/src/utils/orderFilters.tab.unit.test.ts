import { describe, expect, it } from "vitest";
import { buildTabQuery } from "./orderFilters.js";

describe("buildTabQuery", () => {
  it("all includes every order (no junk/reship exclusion)", () => {
    expect(buildTabQuery("all")).toBeUndefined();
  });

  it("channel excludes fulfillment pipeline orders", () => {
    const q = buildTabQuery("channel");
    expect(q).toBeDefined();
    expect(JSON.stringify(q)).toContain("shopify");
    expect(JSON.stringify(q)).toContain("shipmentCreated");
  });

  it("ready-to-ship requires no awb", () => {
    const q = buildTabQuery("ready-to-ship");
    expect(JSON.stringify(q)).toContain("ready_to_ship");
    expect(JSON.stringify(q)).toContain("awb");
  });

  it("pending-pickup includes awb on ready_to_ship", () => {
    const q = buildTabQuery("pending-pickup");
    expect(JSON.stringify(q)).toContain("pickup_scheduled");
    expect(JSON.stringify(q)).toContain("ready_to_ship");
  });

  it("in-transit includes picked_up", () => {
    const q = buildTabQuery("in-transit");
    expect(JSON.stringify(q)).toContain("picked_up");
  });

  it("failed includes ndr and not_picked", () => {
    const q = buildTabQuery("failed");
    expect(JSON.stringify(q)).toContain("failed");
    expect(JSON.stringify(q)).toContain("ndr");
    expect(JSON.stringify(q)).toContain("not_picked");
  });

  it("reship excludes junk", () => {
    const q = buildTabQuery("reship");
    expect(q).toMatchObject({ status: "reship", isJunk: { $ne: true } });
  });

  it("junk tab query is undefined (view handles junk)", () => {
    expect(buildTabQuery("junk")).toBeUndefined();
  });
});
