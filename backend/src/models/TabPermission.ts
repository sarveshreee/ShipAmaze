import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface ITabPermission extends Document {
  role: "vendor" | "dropshipper";
  userId?: Types.ObjectId | null;
  tabKey: string;
  enabled: boolean;
}

const tabPermissionSchema = new Schema<ITabPermission>(
  {
    role: { type: String, enum: ["vendor", "dropshipper"], required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    tabKey: { type: String, required: true },
    enabled: { type: Boolean, required: true },
  },
  { timestamps: true }
);

tabPermissionSchema.index({ role: 1, tabKey: 1, userId: 1 }, { unique: true });

export const TabPermission: Model<ITabPermission> =
  mongoose.models.TabPermission || mongoose.model<ITabPermission>("TabPermission", tabPermissionSchema);
