import { useAuth } from "@/contexts/AuthContext";

/** Centralized business permissions for dropshipper-specific UX and route guards. */
export function useDropshipperAccess() {
  const { user, role } = useAuth();
  const isDropshipper = role === "dropshipper";
  const accessType = user?.dropshipperAccessType ?? "FULL";
  const kycVerified = user?.kycVerified ?? (role !== "dropshipper");
  const kycStatus = user?.kycStatus;
  const isKycPending = isDropshipper && !kycVerified;
  const isRestricted = isDropshipper && (accessType === "RESTRICTED" || isKycPending);
  const allowWarehouseAccess =
    !isDropshipper ? true : (user?.allowWarehouseAccess ?? true) && accessType !== "RESTRICTED" && kycVerified;

  return {
    isDropshipper,
    accessType: isDropshipper ? accessType : undefined,
    isRestricted,
    isKycPending,
    kycVerified,
    kycStatus,
    isFull: !isDropshipper || (accessType === "FULL" && kycVerified),
    allowWarehouseAccess,
    hasWarehouseAccess: role === "admin" || role === "vendor" || allowWarehouseAccess,
    canProcessOrders: role === "admin" || role === "vendor" || (isDropshipper && !isRestricted),
    canUseMarketplace: role === "admin" || role === "vendor" || kycVerified,
    canEditSku: role === "admin",
  };
}
