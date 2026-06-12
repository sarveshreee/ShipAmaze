import { useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

export const STAFF_PERMISSIONS = {
  ORDERS_VIEW: "orders.view",
  ORDERS_CREATE: "orders.create",
  ORDERS_EDIT: "orders.edit",
  PRODUCTS_VIEW: "products.view",
  PRODUCTS_CREATE: "products.create",
  PRODUCTS_EDIT: "products.edit",
  PRODUCTS_DELETE: "products.delete",
  PRODUCTS_IMPORT: "products.import",
  PRODUCTS_EXPORT: "products.export",
  PRODUCTS_APPROVE: "products.approve",
  RETURNS_VIEW: "returns.view",
  RETURNS_MANAGE: "returns.manage",
  NDR_VIEW: "ndr.view",
  NDR_MANAGE: "ndr.manage",
  ANALYTICS_VIEW: "analytics.view",
  CHANNELS_VIEW: "channels.view",
  CHANNELS_MANAGE: "channels.manage",
  CUSTOMERS_VIEW: "customers.view",
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_MANAGE: "inventory.manage",
} as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[keyof typeof STAFF_PERMISSIONS];

export const STAFF_PERMISSION_GROUPS: { title: string; items: { key: StaffPermission; label: string }[] }[] = [
  {
    title: "Orders",
    items: [
      { key: STAFF_PERMISSIONS.ORDERS_VIEW, label: "View orders" },
      { key: STAFF_PERMISSIONS.ORDERS_CREATE, label: "Create orders" },
      { key: STAFF_PERMISSIONS.ORDERS_EDIT, label: "Edit orders" },
    ],
  },
  {
    title: "Products",
    items: [
      { key: STAFF_PERMISSIONS.PRODUCTS_VIEW, label: "View products" },
      { key: STAFF_PERMISSIONS.PRODUCTS_CREATE, label: "Create products" },
      { key: STAFF_PERMISSIONS.PRODUCTS_EDIT, label: "Edit products" },
      { key: STAFF_PERMISSIONS.PRODUCTS_DELETE, label: "Delete products" },
      { key: STAFF_PERMISSIONS.PRODUCTS_IMPORT, label: "Import products" },
      { key: STAFF_PERMISSIONS.PRODUCTS_EXPORT, label: "Export products" },
      { key: STAFF_PERMISSIONS.PRODUCTS_APPROVE, label: "Approve products" },
    ],
  },
  {
    title: "Returns & NDR",
    items: [
      { key: STAFF_PERMISSIONS.RETURNS_VIEW, label: "View returns" },
      { key: STAFF_PERMISSIONS.RETURNS_MANAGE, label: "Manage returns" },
      { key: STAFF_PERMISSIONS.NDR_VIEW, label: "View NDR" },
      { key: STAFF_PERMISSIONS.NDR_MANAGE, label: "Manage NDR" },
    ],
  },
  {
    title: "Channels & inventory",
    items: [
      { key: STAFF_PERMISSIONS.CHANNELS_VIEW, label: "View channels" },
      { key: STAFF_PERMISSIONS.CHANNELS_MANAGE, label: "Manage channels" },
      { key: STAFF_PERMISSIONS.INVENTORY_VIEW, label: "View inventory" },
      { key: STAFF_PERMISSIONS.INVENTORY_MANAGE, label: "Manage inventory" },
    ],
  },
  {
    title: "Insights",
    items: [
      { key: STAFF_PERMISSIONS.ANALYTICS_VIEW, label: "View analytics" },
      { key: STAFF_PERMISSIONS.CUSTOMERS_VIEW, label: "View customers" },
    ],
  },
];

export function useStaffPermissions() {
  const { role, user } = useAuth();
  const permissions = user?.permissions ?? [];

  const isOwnerAdmin = role === "admin" && permissions.length === 0;
  const isStaffAdmin = role === "admin" && permissions.length > 0;

  const has = useCallback(
    (perm: StaffPermission | string): boolean => {
      if (role !== "admin") return false;
      if (isOwnerAdmin) return true;
      return permissions.includes(perm);
    },
    [role, permissions, isOwnerAdmin]
  );

  const hasAny = useCallback(
    (perms: (StaffPermission | string)[]): boolean => {
      if (role !== "admin") return false;
      if (isOwnerAdmin) return true;
      return perms.some((p) => permissions.includes(p));
    },
    [role, permissions, isOwnerAdmin]
  );

  const can = useMemo(
    () => ({
      ordersView: has(STAFF_PERMISSIONS.ORDERS_VIEW),
      ordersCreate: has(STAFF_PERMISSIONS.ORDERS_CREATE),
      ordersEdit: has(STAFF_PERMISSIONS.ORDERS_EDIT),
      productsView: has(STAFF_PERMISSIONS.PRODUCTS_VIEW),
      productsCreate: has(STAFF_PERMISSIONS.PRODUCTS_CREATE),
      productsEdit: has(STAFF_PERMISSIONS.PRODUCTS_EDIT),
      productsDelete: has(STAFF_PERMISSIONS.PRODUCTS_DELETE),
      productsImport: has(STAFF_PERMISSIONS.PRODUCTS_IMPORT),
      productsExport: has(STAFF_PERMISSIONS.PRODUCTS_EXPORT),
      productsApprove: has(STAFF_PERMISSIONS.PRODUCTS_APPROVE),
      returnsView: has(STAFF_PERMISSIONS.RETURNS_VIEW),
      returnsManage: has(STAFF_PERMISSIONS.RETURNS_MANAGE),
      ndrView: has(STAFF_PERMISSIONS.NDR_VIEW),
      ndrManage: has(STAFF_PERMISSIONS.NDR_MANAGE),
      analyticsView: has(STAFF_PERMISSIONS.ANALYTICS_VIEW),
      channelsView: has(STAFF_PERMISSIONS.CHANNELS_VIEW),
      channelsManage: has(STAFF_PERMISSIONS.CHANNELS_MANAGE),
      customersView: has(STAFF_PERMISSIONS.CUSTOMERS_VIEW),
      inventoryView: has(STAFF_PERMISSIONS.INVENTORY_VIEW),
      inventoryManage: has(STAFF_PERMISSIONS.INVENTORY_MANAGE),
    }),
    [has]
  );

  return { isOwnerAdmin, isStaffAdmin, has, hasAny, can, permissions };
}
