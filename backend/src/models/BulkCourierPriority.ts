import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IBulkCourierPriorityEntry {
  courierName: string;
  carrierId?: string;
  /** velocity | lorrigo | ekart — required to book the correct provider in priority mode */
  provider?: "velocity" | "lorrigo" | "ekart";
  rank: number;
}

export interface IBulkCourierPriority extends Document {
  /** Singleton key — only "default" is used for platform-wide bulk processing priority. */
  key: string;
  priorities: IBulkCourierPriorityEntry[];
}

const entrySchema = new Schema<IBulkCourierPriorityEntry>(
  {
    courierName: { type: String, required: true, trim: true },
    carrierId: { type: String, trim: true },
    provider: { type: String, enum: ["velocity", "lorrigo", "ekart"], required: false },
    rank: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const bulkCourierPrioritySchema = new Schema<IBulkCourierPriority>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    priorities: { type: [entrySchema], default: [] },
  },
  { timestamps: true }
);

export const BulkCourierPriority: Model<IBulkCourierPriority> =
  mongoose.models.BulkCourierPriority ||
  mongoose.model<IBulkCourierPriority>("BulkCourierPriority", bulkCourierPrioritySchema);
