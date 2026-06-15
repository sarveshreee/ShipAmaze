import mongoose, { Schema, type Document, type Model } from "mongoose";

export type LabelSizePreset = "4x6" | "A6" | "A5";

export interface ILabelInvoiceSetting extends Document {
  key: string;
  companyName: string;
  address: string;
  logoUrl: string;
  gstAddress: string;
  returnAddress: string;
  returnMobile: string;
  warehouseAddress: string;
  warehouseMobile: string;
  brandName: string;
  invoiceNote: string;
  footerNote: string;
  showBarcode: boolean;
  showCodValue: boolean;
  showProductTable: boolean;
  hideCustomerMobile: boolean;
  hideWarehouseAddress: boolean;
  hideWarehouseMobile: boolean;
  hideReturnAddress: boolean;
  hideReturnMobile: boolean;
  hidePickupAddress: boolean;
  showLogo: boolean;
  showBrandName: boolean;
  showWeight: boolean;
  showProductName: boolean;
  showGstAddress: boolean;
  labelSize: LabelSizePreset;
}

const labelInvoiceSettingSchema = new Schema<ILabelInvoiceSetting>(
  {
    key: { type: String, default: "global", unique: true, index: true },
    companyName: { type: String, default: "" },
    address: { type: String, default: "" },
    logoUrl: { type: String, default: "" },
    gstAddress: { type: String, default: "" },
    returnAddress: { type: String, default: "" },
    returnMobile: { type: String, default: "" },
    warehouseAddress: { type: String, default: "" },
    warehouseMobile: { type: String, default: "" },
    brandName: { type: String, default: "" },
    invoiceNote: { type: String, default: "" },
    footerNote: { type: String, default: "" },
    showBarcode: { type: Boolean, default: true },
    showCodValue: { type: Boolean, default: true },
    showProductTable: { type: Boolean, default: true },
    hideCustomerMobile: { type: Boolean, default: false },
    hideWarehouseAddress: { type: Boolean, default: false },
    hideWarehouseMobile: { type: Boolean, default: false },
    hideReturnAddress: { type: Boolean, default: false },
    hideReturnMobile: { type: Boolean, default: false },
    hidePickupAddress: { type: Boolean, default: false },
    showLogo: { type: Boolean, default: true },
    showBrandName: { type: Boolean, default: true },
    showWeight: { type: Boolean, default: true },
    showProductName: { type: Boolean, default: true },
    showGstAddress: { type: Boolean, default: false },
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
