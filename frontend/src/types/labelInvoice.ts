export type LabelSizePreset = "4x6" | "A6" | "A5";

export type LabelInvoiceSettings = {
  companyName: string;
  address: string;
  logoUrl: string;
  invoiceNote: string;
  footerNote: string;
  showBarcode: boolean;
  showCodValue: boolean;
  showProductTable: boolean;
  labelSize: LabelSizePreset;
  updatedAt?: string;
};

export const DEFAULT_LABEL_INVOICE_SETTINGS: LabelInvoiceSettings = {
  companyName: "",
  address: "",
  logoUrl: "",
  invoiceNote: "",
  footerNote: "",
  showBarcode: true,
  showCodValue: true,
  showProductTable: true,
  labelSize: "4x6",
};
