import { useAuth } from "@/contexts/AuthContext";

/** Centralized business permissions for dropshipper-specific UX and route guards. */
export function useDropshipperAccess() {
  const { user, role } = useAuth();
  const isDropshipper = role === "dropshipper";
  const isVendor = role === "vendor";
  const accessType = user?.dropshipperAccessType ?? "FULL";
  const kycVerified = user?.kycVerified ?? (role !== "dropshipper" && role !== "vendor");
  const kycStatus = user?.kycStatus;
  /** Informational only — does not hide sidebar or block page routes. */
  const isKycPending = (isDropshipper || isVendor) && !kycVerified;
  /** RESTRICTED access type only — separate from KYC (staff/admin toggle). */
  const isRestricted = isDropshipper && accessType === "RESTRICTED";
  const allowWarehouseAccess =
    !isDropshipper ? true : (user?.allowWarehouseAccess ?? true) && accessType !== "RESTRICTED";

  return {
    isDropshipper,
    accessType: isDropshipper ? accessType : undefined,
    isRestricted,
    isKycPending,
    kycVerified,
    kycStatus,
    isFull: !isDropshipper || accessType === "FULL",
    allowWarehouseAccess,
    hasWarehouseAccess: role === "admin" || role === "vendor" || allowWarehouseAccess,
    canProcessOrders: role === "admin" || role === "vendor" || (isDropshipper && !isRestricted),
    canEditSku: role === "admin",
  };
}
