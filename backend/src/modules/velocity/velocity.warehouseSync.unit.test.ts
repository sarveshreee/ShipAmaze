import {
  pickupToVelocityWarehouseInput,
  warehouseDocToVelocityInput,
} from "./velocity.warehouseSync.js";

describe("pickupToVelocityWarehouseInput", () => {
  const base = {
    label: "Mumbai Pickup",
    contactName: "Raj Kumar",
    phone: "9876543210",
    email: "raj@example.com",
    addressLine1: "101 Andheri East",
    addressLine2: "Near Station",
    landmark: "Opp. Mall",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400069",
    country: "India",
    gstin: "27AAACR5055K1Z5",
  };

  it("maps required fields correctly", () => {
    const out = pickupToVelocityWarehouseInput(base, "");
    expect(out.name).toBe("Mumbai Pickup");
    expect(out.contact_person).toBe("Raj Kumar");
    expect(out.email).toBe("raj@example.com");
    expect(out.phone_number).toBe("9876543210");
    expect(out.city).toBe("Mumbai");
    expect(out.state).toBe("Maharashtra");
    expect(out.zip).toBe("400069");
    expect(out.country).toBe("India");
  });

  it("concatenates address lines and landmark into street_address", () => {
    const out = pickupToVelocityWarehouseInput(base, "");
    expect(out.street_address).toBe("101 Andheri East, Near Station, Opp. Mall");
  });

  it("omits empty addressLine2 and landmark from street_address", () => {
    const out = pickupToVelocityWarehouseInput(
      { ...base, addressLine2: "", landmark: "" },
      ""
    );
    expect(out.street_address).toBe("101 Andheri East");
  });

  it("uses fallbackEmail when pickup email is empty", () => {
    const out = pickupToVelocityWarehouseInput(
      { ...base, email: "" },
      "fallback@example.com"
    );
    expect(out.email).toBe("fallback@example.com");
  });

  it("prefers pickup email over fallback", () => {
    const out = pickupToVelocityWarehouseInput(base, "fallback@example.com");
    expect(out.email).toBe("raj@example.com");
  });

  it("includes gst_no when gstin is set", () => {
    const out = pickupToVelocityWarehouseInput(base, "");
    expect(out.gst_no).toBe("27AAACR5055K1Z5");
  });

  it("omits gst_no when gstin is empty", () => {
    const out = pickupToVelocityWarehouseInput({ ...base, gstin: "" }, "");
    expect(out.gst_no).toBeUndefined();
  });

  it("strips non-digits from pincode", () => {
    const out = pickupToVelocityWarehouseInput({ ...base, pincode: "400 069" }, "");
    expect(out.zip).toBe("400069");
  });

  it("defaults country to India when not provided", () => {
    const out = pickupToVelocityWarehouseInput({ ...base, country: undefined }, "");
    expect(out.country).toBe("India");
  });

  it("strips +91 country code from phone", () => {
    const out = pickupToVelocityWarehouseInput({ ...base, phone: "+919876543210" }, "");
    expect(out.phone_number).toBe("9876543210");
  });
});

describe("warehouseDocToVelocityInput", () => {
  const base = {
    name: "Delhi Warehouse",
    contactName: "Priya Singh",
    phone: "9012345678",
    addressLine1: "Plot 5, Okhla Phase II",
    city: "Delhi",
    state: "Delhi",
    pincode: "110020",
  };

  it("maps required fields", () => {
    const out = warehouseDocToVelocityInput(base, "owner@example.com");
    expect(out.name).toBe("Delhi Warehouse");
    expect(out.contact_person).toBe("Priya Singh");
    expect(out.email).toBe("owner@example.com");
    expect(out.phone_number).toBe("9012345678");
    expect(out.city).toBe("Delhi");
    expect(out.zip).toBe("110020");
    expect(out.country).toBe("India");
  });

  it("falls back to name as contact_person when contactName is missing", () => {
    const out = warehouseDocToVelocityInput({ ...base, contactName: undefined }, "e@e.com");
    expect(out.contact_person).toBe("Delhi Warehouse");
  });

  it("concatenates address lines", () => {
    const out = warehouseDocToVelocityInput(
      { ...base, addressLine2: "Building B" },
      "e@e.com"
    );
    expect(out.street_address).toBe("Plot 5, Okhla Phase II, Building B");
  });

  it("strips special characters from warehouse name and contact for couriers", () => {
    const out = pickupToVelocityWarehouseInput(
      {
        ...base,
        label: "ART & SOUL EVENT NEW",
        contactName: "Ravi-Kumar",
      },
      ""
    );
    expect(out.name).toBe("ART SOUL EVENT NEW");
    expect(out.contact_person).toBe("Ravi Kumar");
  });
});
