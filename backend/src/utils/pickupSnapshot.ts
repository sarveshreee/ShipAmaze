import type { Types } from "mongoose";

export function buildPickupSnapshotFromLean(
  pu: {
    label?: string;
    contactName?: string;
    phone?: string;
    alternatePhone?: string;
    email?: string;
    addressLine1?: string;
    addressLine2?: string;
    landmark?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    gstin?: string;
    velocityWarehouseId?: string;
  },
  pickupAddressId: Types.ObjectId
): {
  snapshot: {
    id: string;
    label: string;
    warehouseName: string;
    pickupName: string;
    contactName: string;
    contactPerson: string;
    phone: string;
    alternatePhone: string;
    email: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    gstin: string;
    velocityWarehouseId?: string;
  };
  velocityWarehouseId?: string;
} {
  const label = pu.label || "Pickup Address";
  const snapshotVelocityWh = pu.velocityWarehouseId?.trim();
  const contact = pu.contactName || "";
  return {
    snapshot: {
      id: String(pickupAddressId),
      label,
      warehouseName: label,
      pickupName: label,
      contactName: contact,
      contactPerson: contact,
      phone: pu.phone || "",
      alternatePhone: pu.alternatePhone || "",
      email: pu.email || "",
      address: [pu.addressLine1, pu.addressLine2, pu.landmark].filter(Boolean).join(", "),
      city: pu.city || "",
      state: pu.state || "",
      pincode: pu.pincode || "",
      country: pu.country || "India",
      gstin: pu.gstin || "",
      velocityWarehouseId: snapshotVelocityWh,
    },
    velocityWarehouseId: snapshotVelocityWh,
  };
}
