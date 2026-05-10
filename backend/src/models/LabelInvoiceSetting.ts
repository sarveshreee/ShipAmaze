import mongoose, { Schema, type Document, type Model } from "mongoose";

export type LabelSizePreset = "4x6" | "A6" | "A5";

export interface ILabelInvoiceSetting extends Document {
  key: string;
  companyName: string;
  address: string;
  logoUrl: string;
  invoiceNote: string;
  footerNote: string;
  showBarcode: boolean;
  showCodValue: boolean;
  showProductTable: boolean;
  labelSize: LabelSizePreset;
}

const labelInvoiceSettingSchema = new Schema<ILabelInvoiceSetting>(
  {
    key: { type: String, default: "global", unique: true, index: true },
    companyName: { type: String, default: "" },
    address: { type: String, default: "" },
    logoUrl: { type: String, default: "" },
    invoiceNote: { type: String, default: "" },
    footerNote: { type: String, default: "" },
    showBarcode: { type: Boolean, default: true },
    showCodValue: { type: Boolean, default: true },
    showProductTable: { type: Boolean, default: true },
    labelSize: {
      type: String,
      enum: ["4x6", "A6", "A5"],
      default: "4x6",
    },
  },
  { timestamps: true }
);

export const LabelInvoiceSetting: Model<ILabelInvoiceSetting> =
  mongoose.models.LabelInvoiceSetting ||
  mongoose.model<ILabelInvoiceSetting>("LabelInvoiceSetting", labelInvoiceSettingSchema);
