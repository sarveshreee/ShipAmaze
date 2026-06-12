import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";

export const PRODUCT_PERMISSIONS = {
  VIEW: "products.view",
  CREATE: "products.create",
  EDIT: "products.edit",
  DELETE: "products.delete",
  IMPORT: "products.import",
  EXPORT: "products.export",
  APPROVE: "products.approve",
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

function hasProductStaffRestrictions(role: string, permissions: string[]): boolean {
  if (role !== "admin") return false;
  return permissions.some((p) => p.startsWith("products."));
}

export function useProductPermissions() {
  const { role, user } = useAuth();
  const permissions = user?.permissions ?? [];

  const isStaffRestricted = useMemo(
    () => hasProductStaffRestrictions(role, permissions),
    [role, permissions]
  );

  const can = useMemo(() => {
    const check = (perm: ProductPermission): boolean => {
      if (role === "vendor" || role === "dropshipper") return true;
      if (role !== "admin") return false;
      if (!hasProductStaffRestrictions(role, permissions)) return true;
      return permissions.includes(perm);
    };
    return {
      view: check(PRODUCT_PERMISSIONS.VIEW),
      create: check(PRODUCT_PERMISSIONS.CREATE),
      edit: check(PRODUCT_PERMISSIONS.EDIT),
      delete: check(PRODUCT_PERMISSIONS.DELETE),
      import: check(PRODUCT_PERMISSIONS.IMPORT),
      export: check(PRODUCT_PERMISSIONS.EXPORT),
      approve: check(PRODUCT_PERMISSIONS.APPROVE),
    };
  }, [role, permissions]);

  return { can, isStaffRestricted, permissions };
}
