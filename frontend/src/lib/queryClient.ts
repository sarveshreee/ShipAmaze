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

/** Shared query keys — keep stable across pages for cache reuse. */
export const queryKeys = {
  wallet: ["wallet"] as const,
  notifications: (page = 1) => ["notifications", page] as const,
  dashboard: ["dashboard", "summary"] as const,
  orders: (view?: string) => ["orders", "legacy", view ?? "default"] as const,
  ordersList: (key: string) => ["orders", "list", key] as const,
  manifests: ["manifests"] as const,
  invoices: ["invoices"] as const,
  weightDisputes: ["weight_disputes"] as const,
  transactions: ["transactions"] as const,
  ndr: ["ndr_orders"] as const,
  returns: ["return_orders"] as const,
  products: ["products"] as const,
  couriers: ["couriers"] as const,
  codRemittances: ["cod_remittances"] as const,
  gstRecords: ["gst_records"] as const,
  pickups: (scope?: string) => ["pickup_addresses", scope ?? "default"] as const,
  pincodes: ["pincodes"] as const,
  tabPermissions: ["tab-permissions", "me"] as const,
};
