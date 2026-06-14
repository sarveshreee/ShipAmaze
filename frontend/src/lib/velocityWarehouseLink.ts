import {
  resolveVelocityDashboardUrl,
  resolveVelocityWarehouseUrl,
} from "@/lib/velocityDashboardUrls";

/** Velocity warehouse code format — must match backend `VELOCITY_WH_ID_PATTERN`. */
export const VELOCITY_WH_PATTERN = /^WH[A-Z0-9]+$/i;

/** Velocity merchant home (not API host). */
export const VELOCITY_DASHBOARD_URL = resolveVelocityDashboardUrl(
  import.meta.env.VITE_VELOCITY_DASHBOARD_URL as string | undefined
);

/** Warehouse / address settings — used by pickup link UI. */
export const VELOCITY_WAREHOUSE_URL = resolveVelocityWarehouseUrl(
  import.meta.env.VITE_VELOCITY_WAREHOUSE_URL as string | undefined
);

export type VelocityWarehouseLinkStatus = "linked" | "not_linked" | "invalid";

export function normalizeVelocityWarehouseCode(raw?: string | null): string {
  return String(raw ?? "").trim().toUpperCase();
}

export function validateVelocityWarehouseCode(raw: string): string {
  const t = normalizeVelocityWarehouseCode(raw);
  if (!t) return "Velocity warehouse ID is required";
  if (!VELOCITY_WH_PATTERN.test(t)) {
    return "Use Velocity format: WH followed by letters or digits (e.g. WHZBRR)";
  }
  return "";
}

export function getVelocityWarehouseLinkStatus(
  velocityWarehouseId?: string | null
): VelocityWarehouseLinkStatus {
  const code = normalizeVelocityWarehouseCode(velocityWarehouseId);
  if (!code) return "not_linked";
  if (!VELOCITY_WH_PATTERN.test(code)) return "invalid";
  return "linked";
}

export const VELOCITY_LINK_STATUS_LABEL: Record<VelocityWarehouseLinkStatus, string> = {
  linked: "Linked to Velocity",
  not_linked: "Not Linked",
  invalid: "Link Invalid",
};
