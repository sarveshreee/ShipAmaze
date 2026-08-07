import { describe, expect, it } from "vitest";
import { buildTabQuery, buildStatusFilterQuery } from "./orderFilters.js";

describe("buildTabQuery", () => {
  it("all includes every order (no junk/reship exclusion)", () => {
    expect(buildTabQuery("all")).toBeUndefined();
  });

  it("channel filters by shopify source and excludes fulfillment pipeline orders", () => {
    const q = buildTabQuery("channel");
    expect(q).toBeDefined();
    expect(JSON.stringify(q)).toContain("shopify");
    expect(JSON.stringify(q)).toContain("shipmentCreated");
  });

  it("manual tab excludes ready_to_ship and processed orders", () => {
    const q = buildTabQuery("manual");
    expect(q).toBeDefined();
    expect(JSON.stringify(q)).toContain("ready_to_ship");
    expect(JSON.stringify(q)).toContain("shipmentCreated");
    expect(JSON.stringify(q)).toContain("cancelled");
  });

  it("ready-to-ship requires no awb", () => {
    const q = buildTabQuery("ready-to-ship");
    expect(JSON.stringify(q)).toContain("ready_to_ship");
    expect(JSON.stringify(q)).toContain("awb");
  });

  it("pending-pickup includes ready_for_pickup and not_picked", () => {
    const q = buildTabQuery("pending-pickup");
    const s = JSON.stringify(q);
    expect(s).toContain("pickup_scheduled");
    expect(s).toContain("ready_to_ship");
    expect(s).toContain("ready_for_pickup");
    expect(s).toContain("not_picked");
    expect(s).toContain("out_for_pickup");
    expect(s).toContain("pickup_exception");
  });

  it("failed includes processing failures but not ndr in inclusion set", () => {
    const q = buildTabQuery("failed");
    const s = JSON.stringify(q);
    const inclusionPart = s.split('"$nin"')[0] ?? s;
    expect(inclusionPart).toContain("pickup_failed");
    expect(inclusionPart).toContain("booking_failed");
    expect(inclusionPart).not.toContain("Customer Refused");
    expect(inclusionPart).not.toContain("ndr_raised");
  });

  it("ndr tab includes ndr statuses", () => {
    const q = buildTabQuery("ndr");
    const s = JSON.stringify(q);
    expect(s).toContain("ndr");
    expect(s).toContain("Customer Refused");
  });

  it("rto tab includes rto statuses", () => {
    const q = buildTabQuery("rto");
    const s = JSON.stringify(q);
    expect(s).toContain("rto");
    expect(s).toContain("RTO Initiated");
  });

  it("in-transit includes picked_up", () => {
    const q = buildTabQuery("in-transit");
    expect(JSON.stringify(q)).toContain("picked_up");
  });

  it("in-transit checks saved Velocity shipmentStatus aliases", () => {
    const q = buildTabQuery("in-transit");
    expect(JSON.stringify(q)).toContain("shipmentStatus");
    expect(JSON.stringify(q)).toContain("In Transit");
    expect(JSON.stringify(q)).toContain("In-transit");
  });

  it("delivered checks saved Velocity shipmentStatus aliases", () => {
    const q = buildTabQuery("delivered");
    expect(JSON.stringify(q)).toContain("shipmentStatus");
    expect(JSON.stringify(q)).toContain("Delivered");
  });

  it("reship excludes junk", () => {
    const q = buildTabQuery("reship");
    expect(q).toMatchObject({ status: "reship", isJunk: { $ne: true } });
  });

  it("junk tab query is undefined (view handles junk)", () => {
    expect(buildTabQuery("junk")).toBeUndefined();
  });
});

describe("buildStatusFilterQuery", () => {
  it("in-transit matches shipmentStatus aliases like tab filter", () => {
    const q = buildStatusFilterQuery("in-transit");
    expect(q).toBeDefined();
    const s = JSON.stringify(q);
    expect(s).toContain("shipmentStatus");
    expect(s).toContain("picked_up");
    expect(s).toContain("in_transit");
  });

  it("delivered checks shipmentStatus", () => {
    const q = buildStatusFilterQuery("delivered");
    expect(JSON.stringify(q)).toContain("Delivered");
  });

  it("pending excludes fulfillment pipeline orders", () => {
    const q = buildStatusFilterQuery("pending");
    const s = JSON.stringify(q);
    expect(s).toContain("shipmentCreated");
    expect(s).toContain("ready_to_ship");
  });
});
