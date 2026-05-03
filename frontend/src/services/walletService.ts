import { apiClient } from "@/lib/apiClient";
import type { Transaction, CODRemittance } from "@/types/logistics";

export type WalletSummary = {
  balance: number;
  pendingCod: number;
  totalRecharge: number;
  totalDeductions: number;
  lastSyncedAt: string;
  currency: string;
};

export async function getWalletSummary() {
  return apiClient.get<WalletSummary>("/wallet");
}

export async function addFunds(amount: number) {
  return apiClient.post<{
    success: boolean;
    message: string;
    transaction: { txnId: string; amount: number; status: string };
  }>("/wallet/add-funds", { amount });
}

export async function listTransactions() {
  const rows = await apiClient.get<Transaction[]>("/wallet/transactions");
  return rows.map((t) => ({
    ...t,
    status: t.status ?? "completed",
    displayType:
      t.displayType ??
      (t.ledgerType === "manual_credit_request" || t.ledgerType === "recharge"
        ? "Recharge"
        : t.ledgerType === "cod" || t.ledgerType === "cod_settlement"
          ? "COD"
          : t.ledgerType === "deduction" || t.ledgerType === "shipping" || t.ledgerType === "fee"
            ? "Deduction"
            : t.type === "Debit"
              ? "Debit"
              : "Credit"),
  }));
}

export async function listCodRemittances() {
  return apiClient.get<CODRemittance[]>("/wallet/cod-remittances");
}
