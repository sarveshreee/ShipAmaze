import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IManifest extends Document {
  manifestId: string;
  date: string;
  courier: string;
  ordersCount: number;
  totalWeight: string;
  pickupAddress: string;
  status: string;
  pickupTime?: string;
}

const manifestSchema = new Schema<IManifest>(
  {
    manifestId: { type: String, required: true, unique: true },
    date: { type: String, default: "" },
    courier: { type: String, default: "Delhivery" },
    ordersCount: { type: Number, default: 0 },
    totalWeight: { type: String, default: "" },
    pickupAddress: { type: String, default: "" },
    status: { type: String, default: "Generated" },
    pickupTime: String,
  },
  { timestamps: true }
);

manifestSchema.index({ status: 1, createdAt: -1 });
manifestSchema.index({ date: -1 });

export const Manifest: Model<IManifest> =
  mongoose.models.Manifest || mongoose.model<IManifest>("Manifest", manifestSchema);
