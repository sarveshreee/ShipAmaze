import { STAFF_PERMISSIONS, useStaffPermissions } from "@/hooks/useStaffPermissions";

export const PRODUCT_PERMISSIONS = {
  VIEW: STAFF_PERMISSIONS.PRODUCTS_VIEW,
  CREATE: STAFF_PERMISSIONS.PRODUCTS_CREATE,
  EDIT: STAFF_PERMISSIONS.PRODUCTS_EDIT,
  DELETE: STAFF_PERMISSIONS.PRODUCTS_DELETE,
  IMPORT: STAFF_PERMISSIONS.PRODUCTS_IMPORT,
  EXPORT: STAFF_PERMISSIONS.PRODUCTS_EXPORT,
  APPROVE: STAFF_PERMISSIONS.PRODUCTS_APPROVE,
} as const;

export type ProductPermission = (typeof PRODUCT_PERMISSIONS)[keyof typeof PRODUCT_PERMISSIONS];

export const ALL_PRODUCT_PERMISSIONS: { key: ProductPermission; label: string }[] = [
  { key: PRODUCT_PERMISSIONS.VIEW, label: "View products" },
  { key: PRODUCT_PERMISSIONS.CREATE, label: "Create products" },
  { key: PRODUCT_PERMISSIONS.EDIT, label: "Edit products" },
  { key: PRODUCT_PERMISSIONS.DELETE, label: "Delete products" },
  { key: PRODUCT_PERMISSIONS.IMPORT, label: "Import products" },
  { key: PRODUCT_PERMISSIONS.EXPORT, label: "Export products" },
  { key: PRODUCT_PERMISSIONS.APPROVE, label: "Approve products" },
];

/** @deprecated Prefer useStaffPermissions — kept for existing imports */
export function useProductPermissions() {
  const { isStaffAdmin, can, permissions } = useStaffPermissions();
  return {
    can: {
      view: can.productsView,
      create: can.productsCreate,
      edit: can.productsEdit,
      delete: can.productsDelete,
      import: can.productsImport,
      export: can.productsExport,
      approve: can.productsApprove,
    },
    isStaffRestricted: isStaffAdmin,
    permissions,
  };
}
