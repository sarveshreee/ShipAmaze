import mongoose from "mongoose";
import { Product } from "../models/Product.js";
import { Vendor } from "../models/Vendor.js";
import { Warehouse } from "../models/Warehouse.js";

export type ResolvedSkuRouting = {
  productId?: string;
  productName?: string;
  vendorId?: string;
  vendorName?: string;
  warehouseId?: string;
  warehouseName?: string;
  velocityWarehouseId?: string;
  pickupAddressSnapshot?: {
    id: string;
    label: string;
    warehouseName?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    velocityWarehouseId?: string;
  };
};

/**
 * Resolve vendor/warehouse routing for a SKU using catalogue product ownership.
 * Keeps legacy orders working by returning only fields that can be inferred safely.
 */
export async function resolveRoutingForSku(rawSku: string): Promise<ResolvedSkuRouting | null> {
  const sku = String(rawSku ?? "").trim();
  if (!sku) return null;

  const product = await Product.findOne({
    $or: [{ sku }, { "variants.sku": sku }],
  })
    .select("_id name vendorId vendorName")
    .lean();
  if (!product) return null;

  const result: ResolvedSkuRouting = {
    productId: String(product._id),
    productName: typeof product.name === "string" ? product.name : undefined,
  };

  const vendorId = product.vendorId;
  if (!vendorId || !mongoose.isValidObjectId(String(vendorId))) {
    return result;
  }

  const vendor = await Vendor.findById(vendorId).select("name city pin contactPerson phone email").lean();
  result.vendorId = String(vendorId);
  result.vendorName =
    typeof vendor?.name === "string" && vendor.name.trim()
      ? vendor.name.trim()
      : typeof product.vendorName === "string"
        ? product.vendorName
        : undefined;

  const warehouse = await Warehouse.findOne({
    vendorId,
    $or: [{ isActive: true }, { isActive: { $exists: false } }],
  })
    .sort({ isDefault: -1, createdAt: 1 })
    .lean();

  if (!warehouse) {
    return result;
  }

  result.warehouseId = String(warehouse._id);
  result.warehouseName = typeof warehouse.name === "string" ? warehouse.name : undefined;
  result.velocityWarehouseId =
    typeof warehouse.velocityWarehouseId === "string" && warehouse.velocityWarehouseId.trim()
      ? warehouse.velocityWarehouseId.trim()
      : undefined;
  result.pickupAddressSnapshot = {
    id: String(warehouse._id),
    label: warehouse.name,
    warehouseName: warehouse.name,
    contactName:
      (typeof warehouse.contactName === "string" && warehouse.contactName.trim()) ||
      (typeof vendor?.contactPerson === "string" && vendor.contactPerson.trim()) ||
      "",
    phone:
      (typeof warehouse.phone === "string" && warehouse.phone.trim()) ||
      (typeof vendor?.phone === "string" && vendor.phone.trim()) ||
      "",
    email: typeof vendor?.email === "string" ? vendor.email : "",
    address: [warehouse.addressLine1, warehouse.addressLine2].filter(Boolean).join(", "),
    city: warehouse.city,
    state: warehouse.state,
    pincode: warehouse.pincode,
    country: "India",
    velocityWarehouseId: result.velocityWarehouseId,
  };

  return result;
}
