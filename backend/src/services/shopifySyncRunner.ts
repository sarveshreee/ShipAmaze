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
  normalizeShopifyOrderNumericId,
  shopifyExternalOrderId,
  type ShopifySyncUserContext,
} from "./shopifyOrderSync.js";
import {
  applyCachedDefaultPickupIfMissingForShopify,
  findDefaultOrFirstActivePickupForShopifyOwner,
  type ShopifyPickupApplyTarget,
} from "./shopifyOrderPickup.js";

export type ShopifySkipReason = {
  shopifyId: string;
  orderName?: string;
  reason: string;
};

export type ShopifyOrderSyncResult = {
  shopDomain: string;
  synced: number;
  inserted: number;
  updated: number;
  skipped: number;
  skipReasons: ShopifySkipReason[];
};

function orderOwnedByUser(
  existing: {
    ownerUserId?: Types.ObjectId | null;
    createdBy?: Types.ObjectId | null;
    dropshipperId?: Types.ObjectId | null;
    vendorId?: Types.ObjectId | null;
  },
  ownerUserId: Types.ObjectId,
  role: "admin" | "vendor" | "dropshipper",
  vendorId?: Types.ObjectId
): boolean {
  if (String(existing.ownerUserId ?? "") === String(ownerUserId)) return true;
  if (String(existing.createdBy ?? "") === String(ownerUserId)) return true;
  if (String(existing.dropshipperId ?? "") === String(ownerUserId)) return true;
  if (
    role === "vendor" &&
    existing.vendorId &&
    vendorId &&
    String(existing.vendorId) === String(vendorId)
  ) {
    return true;
  }
  return false;
}

function summarizeSkipReasons(skipReasons: ShopifySkipReason[]): string {
  const counts = new Map<string, number>();
  for (const s of skipReasons) {
    const key = s.reason;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, n]) => `${n}× ${reason}`);
  return parts.join("; ");
}

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

  let accessToken: string;
  try {
    accessToken = decrypt(conn.accessTokenEncrypted);
  } catch {
    const msg =
      "Stored Shopify credentials could not be read. Disconnect and reconnect your store in Channels.";
    conn.lastSyncError = msg;
    await conn.save();
    throw new AppError(502, msg);
  }

  let shopOrders: shopifyService.ShopifyOrder[] = [];
  try {
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
  const skipReasons: ShopifySkipReason[] = [];

  console.info("[shopify-sync] fetched orders", {
    shopDomain: conn.shopDomain,
    ownerUserId: String(ownerUserId),
    role,
    count: shopOrders.length,
  });

  for (const raw of shopOrders) {
    const numericId = normalizeShopifyOrderNumericId(raw?.id);
    if (!raw || numericId == null) {
      skipped++;
      skipReasons.push({
        shopifyId: String(raw?.id ?? "?"),
        orderName: raw?.name,
        reason: "invalid_shopify_id",
      });
      continue;
    }

    const so = { ...raw, id: numericId };
    const externalId = shopifyExternalOrderId(conn.shopDomain, numericId);

    try {
      const mapped = buildShopifyOrderPayload(conn.shopDomain, so, ctx);
      const existing = await Order.findOne({ orderId: externalId });

      if (existing) {
        if (!orderOwnedByUser(existing, ownerUserId, role, ctx.vendorId)) {
          skipped++;
          skipReasons.push({
            shopifyId: String(numericId),
            orderName: so.name,
            reason: "owned_by_another_account",
          });
          continue;
        }
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
    } catch (e: unknown) {
      skipped++;
      const msg = e instanceof Error ? e.message : String(e);
      skipReasons.push({
        shopifyId: String(numericId),
        orderName: so.name,
        reason: msg.slice(0, 240),
      });
      console.error("[shopify-sync] order skip", {
        shopifyId: numericId,
        orderName: so.name,
        externalId,
        error: msg,
      });
    }
  }

  console.info("[shopify-sync] complete", {
    shopDomain: conn.shopDomain,
    fetched: shopOrders.length,
    inserted,
    updated,
    skipped,
    skipSummary: skipped > 0 ? summarizeSkipReasons(skipReasons) : undefined,
  });

  conn.lastSyncedAt = new Date();
  conn.lastSyncError =
    skipped > 0
      ? `${skipped} order(s) skipped: ${summarizeSkipReasons(skipReasons)}`
      : undefined;
  conn.syncCount = (conn.syncCount ?? 0) + 1;
  await conn.save();

  return {
    shopDomain: conn.shopDomain,
    synced: shopOrders.length,
    inserted,
    updated,
    skipped,
    skipReasons,
  };
}
