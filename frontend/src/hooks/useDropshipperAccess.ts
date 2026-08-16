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
  /**
   * Admin toggles unlock features even when accessType is RESTRICTED.
   * RESTRICTED alone only blocks features that are not explicitly enabled.
   */
  const allowWarehouseAccess = !isDropshipper
    ? true
    : isRestricted
      ? user?.allowWarehouseAccess === true
      : (user?.allowWarehouseAccess ?? true);
  const allowOwnPickupProcessing =
    isDropshipper && user?.allowOwnPickupProcessing === true;
  /** Create/process orders: FULL access, or RESTRICTED with own-pickup processing enabled. */
  const canOperateOrders =
    !isDropshipper || !isRestricted || allowOwnPickupProcessing;

  return {
    isDropshipper,
    accessType: isDropshipper ? accessType : undefined,
    isRestricted,
    isKycPending,
    kycVerified,
    kycStatus,
    isFull: !isDropshipper || accessType === "FULL",
    allowWarehouseAccess,
    allowOwnPickupProcessing,
    hasWarehouseAccess: role === "admin" || role === "vendor" || allowWarehouseAccess,
    canProcessOrders: role === "admin" || role === "vendor" || canOperateOrders,
    canProcessSelected: role === "admin" || allowOwnPickupProcessing,
    canEditSku: role === "admin",
  };
}
