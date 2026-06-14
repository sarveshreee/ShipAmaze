/** Merchant UI — not the API host (see backend VELOCITY_BASE_URL). */
export const VELOCITY_DASHBOARD_DEFAULT = "https://dashboard.velocity.in";

/** Warehouse / pickup address management in Velocity merchant UI. */
export const VELOCITY_WAREHOUSE_DEFAULT = "https://dashboard.velocity.in/shipping/settings/address";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

export function resolveVelocityDashboardUrl(raw?: string | null): string {
  return trimTrailingSlash((raw?.trim() || VELOCITY_DASHBOARD_DEFAULT));
}

export function resolveVelocityWarehouseUrl(raw?: string | null): string {
  return trimTrailingSlash((raw?.trim() || VELOCITY_WAREHOUSE_DEFAULT));
}

/** Resolved URLs from Vite env — for build-time logging (Node `process.env`). */
export function resolveVelocityUrlsFromEnv(env: Record<string, string | undefined> = {}) {
  const dashboard = resolveVelocityDashboardUrl(env.VITE_VELOCITY_DASHBOARD_URL);
  const warehouse = resolveVelocityWarehouseUrl(env.VITE_VELOCITY_WAREHOUSE_URL);
  return { dashboard, warehouse };
}
