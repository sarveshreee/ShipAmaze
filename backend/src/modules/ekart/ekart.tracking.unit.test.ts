import { describe, expect, it } from "vitest";
import {
  extractEkartShipmentBlock,
  mapEkartTrackHistory,
  parseEkartTrackResponse,
} from "./ekart.tracking.js";
import { mapEkartStatusToProviderCanonical } from "../courier/statusNormalize.js";

/** Durin TrackResponseV2 example shape (newest-first history). */
const TRACK_SAMPLE = {
  CLTC0000000001: {
    shipment_type: "COD",
    shipment_id: "CLTC0000000001",
    external_tracking_id: "CLTC0000000001",
    order_id: "5180823923081454",
    delivered: true,
    merchant_name: "ABC",
    history: [
      {
        city: "Nirsa",
        status: "delivered",
        event_date_iso8601: "2018-08-28T18:03:33.000+05:30",
        hub_name: "NirsaHub_NRA",
        public_description: "Delivered to Customer",
      },
      {
        city: "Nirsa",
        status: "out_for_delivery",
        event_date_iso8601: "2018-08-28T07:38:28.000+05:30",
        hub_name: "NirsaHub_NRA",
        public_description: "Out for delivery",
      },
      {
        city: "New Delhi",
        status: "in_transit",
        event_date_iso8601: "2018-08-24T23:48:41.000+05:30",
        hub_name: "Bamnoli Sort Centre",
        public_description: "Received at Bamnoli Sort Centre",
      },
    ],
  },
};

describe("Ekart track mapping", () => {
  it("extracts shipment block keyed by tracking id", () => {
    const block = extractEkartShipmentBlock(TRACK_SAMPLE, "CLTC0000000001");
    expect(block.shipment_id).toBe("CLTC0000000001");
    expect(block.delivered).toBe(true);
  });

  it("maps history to activities with public descriptions", () => {
    const acts = mapEkartTrackHistory(TRACK_SAMPLE.CLTC0000000001.history);
    expect(acts).toHaveLength(3);
    expect(acts[0].activity).toBe("Delivered to Customer");
    expect(acts[0].location).toBe("NirsaHub_NRA");
  });

  it("prefers machine history status over public_description for Order mapping", () => {
    const parsed = parseEkartTrackResponse(TRACK_SAMPLE, "CLTC0000000001");
    expect(parsed.status).toBe("delivered");
    expect(parsed.rawStatusCode).toBe("delivered");
    expect(mapEkartStatusToProviderCanonical(parsed.status)).toBe("DELIVERED");
    expect(parsed.activities[0].activity).toBe("Delivered to Customer");
    expect(parsed.deliveredDate).toContain("2018-08-28");
  });

  it("falls back when history is empty but delivered flag is set", () => {
    const parsed = parseEkartTrackResponse(
      {
        TECP1: {
          shipment_id: "TECP1",
          delivered: true,
          history: [],
        },
      },
      "TECP1"
    );
    expect(parsed.status).toBe("delivered");
  });

  it("empty history without delivered flag stays at shipment_created", () => {
    const parsed = parseEkartTrackResponse(
      {
        TECP2: {
          shipment_id: "TECP2",
          history: [],
        },
      },
      "TECP2"
    );
    expect(parsed.status).toBe("shipment_created");
    expect(mapEkartStatusToProviderCanonical(parsed.status)).toBe("CREATED");
  });

  it("normalizes Durin Critical Updates status codes", () => {
    expect(mapEkartStatusToProviderCanonical("shipped")).toBe("IN_TRANSIT");
    expect(mapEkartStatusToProviderCanonical("mh_received")).toBe("IN_TRANSIT");
    expect(mapEkartStatusToProviderCanonical("undelivered_attempted")).toBe("FAILED");
    expect(mapEkartStatusToProviderCanonical("return_delivered")).toBe("RETURNED");
    expect(mapEkartStatusToProviderCanonical("return_lost")).toBe("LOST");
  });
});
