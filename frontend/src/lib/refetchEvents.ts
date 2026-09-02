/** Invalidate orders list + tab counts and dashboard KPIs after order mutations. */
export function refetchOrdersAndDashboard(): void {
  window.dispatchEvent(new Event("shipamaze:refetch:orders"));
  window.dispatchEvent(new Event("shipamaze:refetch:dashboard"));
}
