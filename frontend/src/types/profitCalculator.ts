export type ProfitCalculatorSettings = {
  rtoChargePerOrder: number;
  shippingChargePerOrder: number;
  updatedAt?: string;
};

export const DEFAULT_PROFIT_CALCULATOR_SETTINGS: ProfitCalculatorSettings = {
  rtoChargePerOrder: 0,
  shippingChargePerOrder: 85,
};

export type ProfitCalculatorResult = {
  expectedOrders: number;
  confirmed: number;
  delivered: number;
  rto: number;
  revenue: number;
  sourcingCost: number;
  shippingCost: number;
  rtoCost: number;
  adCost: number;
  miscCost: number;
  totalSpend: number;
  netProfit: number;
  netPerDelivered: number;
};
