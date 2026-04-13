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
          orders: dedupeOrders([...incoming, ...state.orders]),
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