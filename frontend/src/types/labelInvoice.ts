import { BRAND_LOGO } from "@/lib/brandAssets";

export type LabelSizePreset = "4x6" | "A6" | "A5";

export type LabelInvoiceSettings = {
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
  showLogo: boolean;
  showBrandName: boolean;
  showWeight: boolean;
  showProductName: boolean;
  showGstAddress: boolean;
  labelSize: LabelSizePreset;
  updatedAt?: string;
};

export const DEFAULT_LABEL_INVOICE_SETTINGS: LabelInvoiceSettings = {
  companyName: "",
  address: "",
  logoUrl: BRAND_LOGO,
  gstAddress: "",
  returnAddress: "",
  returnMobile: "",
  warehouseAddress: "",
  warehouseMobile: "",
  brandName: "",
  invoiceNote: "",
  footerNote: "",
  showBarcode: true,
  showCodValue: true,
  showProductTable: true,
  hideCustomerMobile: false,
  hideWarehouseAddress: false,
  hideWarehouseMobile: false,
  hideReturnAddress: false,
  hideReturnMobile: false,
  showLogo: true,
  showBrandName: true,
  showWeight: true,
  showProductName: true,
  showGstAddress: false,
  labelSize: "4x6",
};
