import { useAuth } from "@/contexts/AuthContext";

/** Centralized business permissions for dropshipper-specific UX and route guards. */
export function useDropshipperAccess() {
  const { user, role } = useAuth();
  const isDropshipper = role === "dropshipper";
  const accessType = user?.dropshipperAccessType ?? "FULL";
  const isRestricted = isDropshipper && accessType === "RESTRICTED";
  const allowWarehouseAccess =
    !isDropshipper ? true : (user?.allowWarehouseAccess ?? true) && accessType !== "RESTRICTED";

  return {
    isDropshipper,
    accessType: isDropshipper ? accessType : undefined,
    isRestricted,
    isFull: !isDropshipper || accessType === "FULL",
    allowWarehouseAccess,
    hasWarehouseAccess: role === "admin" || role === "vendor" || allowWarehouseAccess,
    canProcessOrders: role === "admin" || role === "vendor" || (isDropshipper && !isRestricted),
    canEditSku: role === "admin",
  };
}
