import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface ICourier extends Document {
  name: string;
  active: boolean;
  priority: number;
  deliveryRate: number;
  ndrRate: number;
  rtoRate: number;
  avgDeliveryDays: number;
  codSupport: boolean;
  reversePickup: boolean;
  surfaceRate: number;
  airRate: number;
  /** Platform pickup address used for this courier's shipments (Pickup._id). */
  preferredPickupAddressId?: string;
}

const courierSchema = new Schema<ICourier>(
  {
    name: { type: String, required: true, unique: true },
    active: { type: Boolean, default: true },
    priority: { type: Number, default: 99 },
    deliveryRate: { type: Number, default: 0 },
    ndrRate: { type: Number, default: 0 },
    rtoRate: { type: Number, default: 0 },
    avgDeliveryDays: { type: Number, default: 3 },
    codSupport: { type: Boolean, default: true },
    reversePickup: { type: Boolean, default: false },
    surfaceRate: { type: Number, default: 0 },
    airRate: { type: Number, default: 0 },
    preferredPickupAddressId: { type: String, default: "" },
  },
  { timestamps: true }
);

export const Courier: Model<ICourier> =
  mongoose.models.Courier || mongoose.model<ICourier>("Courier", courierSchema);
