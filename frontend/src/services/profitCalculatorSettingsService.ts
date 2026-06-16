import { apiClient } from "@/lib/apiClient";
import type { ProfitCalculatorSettings } from "@/types/profitCalculator";

export async function getProfitCalculatorSettings(): Promise<ProfitCalculatorSettings> {
  return apiClient.get<ProfitCalculatorSettings>("/settings/profit-calculator");
}

export async function putProfitCalculatorSettings(
  body: Pick<ProfitCalculatorSettings, "rtoChargePerOrder" | "shippingChargePerOrder">
): Promise<ProfitCalculatorSettings> {
  return apiClient.put<ProfitCalculatorSettings>("/settings/profit-calculator", body);
}
