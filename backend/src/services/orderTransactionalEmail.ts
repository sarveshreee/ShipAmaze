import type { Schema } from "mongoose";
import mongoose from "mongoose";
import {
  sendOrderCreatedEmail,
  sendOrderTrackingEmail,
  sendShipmentCreatedEmail,
} from "./email/emailService.js";

/** Attach transactional email side-effects to Order saves (tracking, shipment AWB, new order confirmation). */
export function registerOrderEmailHooks(orderSchema: Schema): void {
  orderSchema.pre("save", async function () {
    const doc = this as mongoose.Document & {
      $locals: Record<string, unknown>;
      isNew: boolean;
      _id: mongoose.Types.ObjectId;
      isModified: (path: string) => boolean;
    };

    doc.$locals.__wasNew = doc.isNew;
    doc.$locals.__emailPrevStatus = "";
    doc.$locals.__emailPrevAwb = "";
    doc.$locals.__emailPrevShipmentCreated = false;

    if (doc.isNew) return;

    const Model = doc.constructor as mongoose.Model<Record<string, unknown>>;
    const prevDoc = await Model.findById(doc._id).select("status awb shipmentCreated").lean();
    doc.$locals.__emailPrevStatus = String(prevDoc?.status ?? "");
    doc.$locals.__emailPrevAwb = String(prevDoc?.awb ?? "").trim();
    doc.$locals.__emailPrevShipmentCreated = Boolean(prevDoc?.shipmentCreated);
  });

  orderSchema.post("save", (doc: mongoose.Document) => {
    void handleOrderPostSave(doc);
  });
}

async function handleOrderPostSave(doc: mongoose.Document): Promise<void> {
  const loc = (doc as unknown as { $locals?: Record<string, unknown> }).$locals ?? {};
  const wasNew = Boolean(loc.__wasNew);
  const prevStatusRaw = String(loc.__emailPrevStatus ?? "");
  const prevAwb = String(loc.__emailPrevAwb ?? "").trim();
  const prevShipmentCreated = Boolean(loc.__emailPrevShipmentCreated);

  const plain = doc.toObject() as Record<string, unknown>;

  try {
    if (wasNew) {
      const { normalizeOrderStatus } = await import("../utils/orderStatus.js");
      const st = normalizeOrderStatus(String(plain.status ?? ""));
      if (st !== "draft") {
        await sendOrderCreatedEmail(plain as Parameters<typeof sendOrderCreatedEmail>[0]);
      }
      return;
    }

    const nextAwb = String(plain.awb || plain.trackingId || "").trim();
    const firstAwb = Boolean(nextAwb && !prevAwb);
    const firstShipmentFlag = Boolean(plain.shipmentCreated && !prevShipmentCreated && nextAwb);

    if (firstAwb || firstShipmentFlag) {
      await sendShipmentCreatedEmail({ order: plain as never });
      return;
    }

    await sendOrderTrackingEmail({
      order: plain as never,
      previousStatusRaw: prevStatusRaw,
    });
  } catch (e: unknown) {
    console.error("[order-email] post-save:", e instanceof Error ? e.message : e);
  }
}
