/**
 * Shared Shopify order import used by manual sync and post-OAuth initial sync.
 */

import { Types } from "mongoose";
import { ShopifyStoreConnection } from "../models/ShopifyStoreConnection.js";
import { Order } from "../models/Order.js";
import { Vendor } from "../models/Vendor.js";
import { AppError } from "../middleware/errorMiddleware.js";
import { decrypt } from "../utils/crypto.js";
import * as shopifyService from "./shopify.service.js";
import {
  buildShopifyOrderPayload,
  mergeShopifyPayloadIntoOrder,
  shopifyExternalOrderId,
  type ShopifySyncUserContext,
} from "./shopifyOrderSync.js";
import {
  applyCachedDefaultPickupIfMissingForShopify,
  findDefaultOrFirstActivePickupForShopifyOwner,
  type ShopifyPickupApplyTarget,
} from "./shopifyOrderPickup.js";

export type ShopifyOrderSyncResult = {
  shopDomain: string;
  synced: number;
  inserted: number;
  updated: number;
  skipped: number;
};

export async function performShopifyOrderSyncForUser(
  ownerUserId: Types.ObjectId,
  role: "admin" | "vendor" | "dropshipper"
): Promise<ShopifyOrderSyncResult> {
  const conn = await ShopifyStoreConnection.findOne({
    ownerUserId,
    isActive: true,
  });
  if (!conn) {
    throw new AppError(400, "No active Shopify store connected. Please connect first.");
  }

  let shopOrders: shopifyService.ShopifyOrder[] = [];
  try {
    const accessToken = decrypt(conn.accessTokenEncrypted);
    shopOrders = await shopifyService.getOrders(accessToken, conn.shopDomain);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Shopify sync failed";
    conn.lastSyncError = msg;
    await conn.save();
    throw e instanceof AppError ? e : new AppError(502, msg);
  }

  const vendor =
    role === "vendor" ? await Vendor.findOne({ userId: ownerUserId }).select("_id").lean() : null;
  const ctx: ShopifySyncUserContext = {
    ownerUserId,
    createdBy: ownerUserId,
    dropshipperId: role === "dropshipper" ? ownerUserId : undefined,
    vendorId: vendor?._id,
  };

  const defaultPickup = await findDefaultOrFirstActivePickupForShopifyOwner(ownerUserId, role);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const so of shopOrders) {
    try {
      if (!so || typeof so.id !== "number") {
        skipped++;
        continue;
      }
      const externalId = shopifyExternalOrderId(conn.shopDomain, so.id);
      const mapped = buildShopifyOrderPayload(conn.shopDomain, so, ctx);

      const existing = await Order.findOne({
        orderId: externalId,
        $or: [{ createdBy: ownerUserId }, { ownerUserId }, { dropshipperId: ownerUserId }],
      });
      if (existing) {
        mergeShopifyPayloadIntoOrder(existing, mapped, Boolean(so.cancelled_at));
        existing.createdBy = ownerUserId;
        existing.ownerUserId = ownerUserId;
        if (ctx.dropshipperId) existing.dropshipperId = ctx.dropshipperId;
        if (ctx.vendorId) existing.vendorId = ctx.vendorId;
        if (applyCachedDefaultPickupIfMissingForShopify(existing, defaultPickup)) {
          existing.markModified("pickupAddress");
        }
        await existing.save();
        updated++;
      } else {
        applyCachedDefaultPickupIfMissingForShopify(mapped as ShopifyPickupApplyTarget, defaultPickup);
        await Order.create(mapped);
        inserted++;
      }
    } catch {
      skipped++;
    }
  }

  conn.lastSyncedAt = new Date();
  conn.lastSyncError =
    skipped > 0 ? `${skipped} order(s) skipped due to mapping or save errors` : undefined;
  conn.syncCount = (conn.syncCount ?? 0) + 1;
  await conn.save();

  return {
    shopDomain: conn.shopDomain,
    synced: shopOrders.length,
    inserted,
    updated,
    skipped,
  };
}
