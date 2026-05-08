import { apiClient, downloadAuthenticatedFile } from "@/lib/apiClient";

export type ReportsSummary = {
  orderCount: number;
  totalAmount: number;
  shipmentCount: number;
  deliveredCount: number;
  deliveryRatePct: number;
  byStatus: { status: string; count: number }[];
  byCourier: { courier: string; count: number; revenue: number }[];
  byPayment: { payment: string; count: number }[];
  byZone: { zone: string; orders: number; delivered: number; deliveryRatePct: number }[];
};

export type ReportOrderRow = {
  id: string;
  customer: string;
  phone: string;
  city: string;
  state?: string;
  pincode: string;
  courier: string;
  payment: string;
  status: string;
  date: string;
  awb: string;
  amount: number;
  shipmentCreated: boolean;
  shipmentId?: string;
  trackingId?: string;
  channel?: string;
  externalSource?: string;
  sourceType?: string;
};

export function buildReportsQueryString(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function fetchReportsSummary(params: Record<string, string | undefined>) {
  return apiClient.get<ReportsSummary>(`/reports/summary${buildReportsQueryString(params)}`);
}

export async function fetchReportsOrders(params: Record<string, string | undefined>) {
  return apiClient.get<{
    orders: ReportOrderRow[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/reports/orders${buildReportsQueryString(params)}`);
}

export async function downloadReportCsv(
  type: "orders" | "shipments" | "wallet" | "cod" | "invoices",
  params: Record<string, string | undefined>
) {
  const fallback = `shipamaze-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
  await downloadAuthenticatedFile(`/exports/csv${buildReportsQueryString({ type, ...params })}`, fallback);
}
