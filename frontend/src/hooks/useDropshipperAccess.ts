import { useAuth } from "@/contexts/AuthContext";

/** FULL dropshippers have vendors/warehouses/order-processing access; RESTRICTED do not. */
export function useDropshipperAccess() {
  const { user, role } = useAuth();
  const isDropshipper = role === "dropshipper";
  const accessType = user?.dropshipperAccessType ?? "FULL";
  const isRestricted = isDropshipper && accessType === "RESTRICTED";
  const isFull = !isDropshipper || accessType === "FULL";
  return {
    isDropshipper,
    accessType: isDropshipper ? accessType : undefined,
    isRestricted,
    isFull,
    canProcessOrders: isFull || role === "admin" || role === "vendor",
    canEditSku: (role === "admin" || role === "vendor" || isFull) && role !== undefined,
  };
}
