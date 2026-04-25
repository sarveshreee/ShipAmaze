import { apiClient } from "@/lib/apiClient";
import type { Transaction, CODRemittance } from "@/types/logistics";

export async function getWalletSummary() {
  return apiClient.get<{ balance: number; currency: string }>("/wallet");
}

export async function listTransactions() {
  return apiClient.get<Transaction[]>("/wallet/transactions");
}

export async function listCodRemittances() {
  return apiClient.get<CODRemittance[]>("/wallet/cod-remittances");
}
