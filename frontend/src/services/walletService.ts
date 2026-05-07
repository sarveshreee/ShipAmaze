import { apiClient } from "@/lib/apiClient";
import type { Transaction, CODRemittance } from "@/types/logistics";

export type WalletSummary = {
  balance: number;
  pendingCod: number;
  totalCredits?: number;
  totalDebits?: number;
  totalRecharge?: number;
  totalDeductions?: number;
  lastSyncedAt: string;
  currency: string;
};

function unwrapData<T>(raw: unknown): T {
  if (raw && typeof raw === "object" && "data" in raw && (raw as { data: unknown }).data !== undefined) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

export async function getWalletSummary(userId?: string): Promise<WalletSummary> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const raw = await apiClient.get<unknown>(`/wallet${qs}`);
  const d = unwrapData<WalletSummary>(raw);
  return {
    ...d,
    totalCredits: d.totalCredits ?? d.totalRecharge ?? 0,
    totalDebits: d.totalDebits ?? d.totalDeductions ?? 0,
  };
}

export async function addWalletBalance(amount: number, mode: "manual_test" | "manual" = "manual_test") {
  return apiClient.post<{ success: boolean; message?: string; data?: { balanceAfter: number; txnId: string; mode?: string } }>(
    "/wallet/add-balance",
    { amount, mode }
  );
}

/** @deprecated use addWalletBalance */
export async function addFunds(amount: number) {
  return addWalletBalance(amount);
}

export async function listTransactions(params?: { page?: number; pageSize?: number; type?: string; status?: string }) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params?.type) sp.set("type", params.type);
  if (params?.status) sp.set("status", params.status);
  const q = sp.toString();
  const raw = await apiClient.get<unknown>(`/wallet/transactions${q ? `?${q}` : ""}`);
  if (raw && typeof raw === "object" && "data" in raw && Array.isArray((raw as { data: unknown }).data)) {
    const o = raw as { data: Transaction[]; page?: number; pageSize?: number; total?: number };
    return {
      items: o.data.map((t) => ({
        ...t,
        status: t.status ?? "completed",
        displayType:
          t.displayType ??
          (t.ledgerType === "manual_credit_request" ||
          t.ledgerType === "recharge" ||
          t.ledgerType === "manual_test_recharge"
            ? "Recharge"
            : t.ledgerType === "cod" || t.ledgerType === "cod_settlement"
              ? "COD"
              : t.ledgerType === "deduction" ||
                  t.ledgerType === "shipping" ||
                  t.ledgerType === "fee" ||
                  t.ledgerType === "admin_manual_debit"
                ? "Deduction"
                : t.ledgerType === "admin_adjustment_debit"
                  ? "Deduction"
                  : t.ledgerType === "admin_adjustment_credit"
                    ? "Recharge"
                    : t.type === "Debit"
                    ? "Debit"
                    : "Credit"),
      })),
      page: o.page ?? 1,
      pageSize: o.pageSize ?? 50,
      total: o.total ?? o.data.length,
    };
  }
  const rows = (Array.isArray(raw) ? raw : []) as Transaction[];
  return {
    items: rows.map((t) => ({ ...t, status: t.status ?? "completed" })),
    page: 1,
    pageSize: rows.length,
    total: rows.length,
  };
}

export async function listCodRemittances() {
  return apiClient.get<CODRemittance[]>("/wallet/cod-remittances");
}

export type AdminWalletRow = {
  userId: string;
  name: string;
  email: string;
  role: string;
  companyName: string;
  balance: number;
  currency: string;
  updatedAt?: string;
};

export async function adminListWallets() {
  const raw = await apiClient.get<unknown>("/admin/wallets");
  return unwrapData<AdminWalletRow[]>(raw);
}

export async function adminAdjustWallet(userId: string, amount: number, reason: string) {
  return apiClient.patch<{ success: boolean; message?: string; data?: { balanceAfter: number; txnId: string } }>(
    `/admin/wallets/${encodeURIComponent(userId)}/adjust`,
    { amount, reason }
  );
}

export type AdminTxRow = Transaction & {
  userId?: string;
  balanceBefore?: number;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
};

export async function adminListWalletTransactions(params?: {
  page?: number;
  pageSize?: number;
  userId?: string;
  type?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params?.userId) sp.set("userId", params.userId);
  if (params?.type) sp.set("type", params.type);
  if (params?.status) sp.set("status", params.status);
  if (params?.dateFrom) sp.set("dateFrom", params.dateFrom);
  if (params?.dateTo) sp.set("dateTo", params.dateTo);
  const q = sp.toString();
  const raw = await apiClient.get<unknown>(`/admin/wallet-transactions${q ? `?${q}` : ""}`);
  if (raw && typeof raw === "object" && "data" in raw) {
    const o = raw as { data: AdminTxRow[]; page?: number; pageSize?: number; total?: number };
    return { items: o.data, page: o.page ?? 1, pageSize: o.pageSize ?? 25, total: o.total ?? 0 };
  }
  return { items: [] as AdminTxRow[], page: 1, pageSize: 25, total: 0 };
}
