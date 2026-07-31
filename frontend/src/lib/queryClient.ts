import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/apiClient";

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    // Never retry client/auth errors or permanent failures
    if (error.status >= 400 && error.status < 500) return false;
    if (error.status >= 500) return failureCount < 1;
  }
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/** Wipe cached API data when the authenticated identity changes (login / logout). */
export function resetSessionQueries() {
  queryClient.clear();
}

/** Shared query keys — keep stable across pages for cache reuse. Always include userId for role-scoped data. */
export const queryKeys = {
  wallet: (userId?: string | null) => ["wallet", userId ?? "anon"] as const,
  notifications: (userId: string | null | undefined, page = 1) =>
    ["notifications", userId ?? "anon", page] as const,
  dashboard: (userId?: string | null) => ["dashboard", "summary", userId ?? "anon"] as const,
  orders: (userId: string | null | undefined, view?: string) =>
    ["orders", "legacy", userId ?? "anon", view ?? "default"] as const,
  ordersList: (userId: string | null | undefined, key: string) =>
    ["orders", "list", userId ?? "anon", key] as const,
  manifests: (userId?: string | null) => ["manifests", userId ?? "anon"] as const,
  invoices: (userId?: string | null) => ["invoices", userId ?? "anon"] as const,
  weightDisputes: (userId?: string | null) => ["weight_disputes", userId ?? "anon"] as const,
  transactions: (userId?: string | null) => ["transactions", userId ?? "anon"] as const,
  ndr: (userId?: string | null) => ["ndr_orders", userId ?? "anon"] as const,
  returns: (userId?: string | null) => ["return_orders", userId ?? "anon"] as const,
  products: (userId?: string | null) => ["products", userId ?? "anon"] as const,
  couriers: ["couriers"] as const,
  codRemittances: (userId?: string | null) => ["cod_remittances", userId ?? "anon"] as const,
  gstRecords: (userId?: string | null) => ["gst_records", userId ?? "anon"] as const,
  pickups: (userId: string | null | undefined, scope?: string) =>
    ["pickup_addresses", userId ?? "anon", scope ?? "default"] as const,
  pincodes: ["pincodes"] as const,
  tabPermissions: ["tab-permissions", "me"] as const,
};
