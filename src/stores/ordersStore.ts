import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { orders as initialOrders, type Order } from "@/data/mockData";

interface OrdersStore {
  orders: Order[];
  mergeOrders: (incoming: Order[]) => void;
  addOrder: (order: Order) => void;
}

const dedupeOrders = (incoming: Order[]) => {
  const seen = new Set<string>();

  return incoming.filter((order) => {
    if (seen.has(order.id)) return false;
    seen.add(order.id);
    return true;
  });
};

const mergeOrdersByCurrentPriority = (current: Order[], incoming: Order[]) => {
  const incomingMap = new Map(incoming.map((order) => [order.id, order]));
  const currentIds = new Set(current.map((order) => order.id));

  const updatedCurrent = current.map((order) => incomingMap.get(order.id) ?? order);
  const newIncoming = incoming.filter((order) => !currentIds.has(order.id));

  return dedupeOrders([...updatedCurrent, ...newIncoming]);
};

const getOrderSequence = (orderId: string) => {
  const match = orderId.match(/^SF(\d+)$/i);
  return match ? Number.parseInt(match[1], 10) : 0;
};

export const getNextSequentialOrderId = (orders: Order[]) => {
  const nextSequence =
    orders.reduce((highest, order) => Math.max(highest, getOrderSequence(order.id)), 10000) + 1;

  return `SF${String(nextSequence).padStart(5, "0")}`;
};

export const useOrdersStore = create<OrdersStore>()(
  persist(
    (set) => ({
      orders: initialOrders,
      mergeOrders: (incoming) =>
        set((state) => ({
          orders: mergeOrdersByCurrentPriority(state.orders, incoming),
        })),
      addOrder: (order) =>
        set((state) => ({
          orders: dedupeOrders([order, ...state.orders]),
        })),
    }),
    {
      name: "orders-store",
      storage: createJSONStorage(() => localStorage),
    }
  )
);