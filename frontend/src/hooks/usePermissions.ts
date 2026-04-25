import { useAuth } from "@/contexts/AuthContext";

export interface PermissionConfig {
  canSelfProcessOrders: boolean;
  canViewPayouts: boolean;
  canViewGST: boolean;
  canViewRemittance: boolean;
}

const STORAGE_KEY = "shipflow_user_permissions";

const defaultPerms: Record<string, PermissionConfig> = {
  admin: {
    canSelfProcessOrders: true,
    canViewPayouts: true,
    canViewGST: true,
    canViewRemittance: true,
  },
  vendor: {
    canSelfProcessOrders: false,
    canViewPayouts: true,
    canViewGST: true,
    canViewRemittance: true,
  },
  dropshipper: {
    canSelfProcessOrders: false,
    canViewPayouts: false,
    canViewGST: false,
    canViewRemittance: false,
  },
};

export function usePermissions(): PermissionConfig & { isAdmin: boolean } {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  // Allow per-user overrides via localStorage (admin can flip these for demo)
  let stored: Partial<PermissionConfig> = {};
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${role}`);
    if (raw) stored = JSON.parse(raw);
  } catch {
    // ignore
  }

  const merged = { ...defaultPerms[role], ...stored };
  return { ...merged, isAdmin };
}

// Defines allowed status transitions for non-admin users
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  "ready-to-ship": ["pending-pickup", "in-transit"],
  "pending-pickup": ["in-transit"],
  "in-transit": ["out-for-delivery"],
  "out-for-delivery": ["delivered"],
  "delivered": [],
};

export function getAllowedTargets(currentStatus: string, isAdmin: boolean, allMovable: { value: string; label: string }[]) {
  if (isAdmin) return allMovable;
  const allowed = STATUS_TRANSITIONS[currentStatus] || [];
  return allMovable.filter((m) => allowed.includes(m.value));
}
