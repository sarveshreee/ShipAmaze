import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

export interface Warehouse {
  id: string;
  vendorId: string;
  vendorName: string;
  warehouseName: string;
  contactPerson: string;
  phoneNumber: string;
  email: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  warehouseType: string;
  status: "Active" | "Inactive";
  isDefault?: boolean;
  gstNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const KEY = "shipflow_vendor_warehouses";

function loadAll(): Warehouse[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seedDefaults();
    const parsed = JSON.parse(raw) as Warehouse[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(items: Warehouse[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

function seedDefaults(): Warehouse[] {
  const seed: Warehouse[] = [
    {
      id: "wh_seed_1",
      vendorId: "vendor-demo",
      vendorName: "Akhil Jain",
      warehouseName: "1739 - Akhil Jain",
      contactPerson: "Akhil Jain",
      phoneNumber: "8401999313",
      email: "shreyanshsilkmills@gmail.com",
      addressLine1: "S-128/129, UPPER GROUND, BELGIUM SQUARE",
      addressLine2: "OPP. LINEAR BUS STAND, NEAR LORDS PLAZZA HOTEL, DELHI GATE",
      city: "Surat",
      state: "Gujarat",
      pincode: "395003",
      country: "India",
      warehouseType: "B2B Warehouse",
      status: "Active",
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  saveAll(seed);
  return seed;
}

export function useVendorWarehouses() {
  const { user } = useAuth() as any;
  const vendorId = user?.id || "vendor-demo";
  const vendorName = user?.user_metadata?.full_name || user?.email || "Vendor";

  const [items, setItems] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const all = loadAll();
    setItems(all);
    setLoading(false);
  }, []);

  const myItems = items.filter(
    (w) => w.vendorId === vendorId || w.vendorId === "vendor-demo"
  );

  const addWarehouse = useCallback(
    (data: Omit<Warehouse, "id" | "vendorId" | "vendorName" | "createdAt" | "updatedAt">) => {
      const all = loadAll();
      const now = new Date().toISOString();
      const newItem: Warehouse = {
        ...data,
        id: `wh_${Date.now()}`,
        vendorId,
        vendorName,
        createdAt: now,
        updatedAt: now,
      };
      const next = [newItem, ...all];
      saveAll(next);
      setItems(next);
      return newItem;
    },
    [vendorId, vendorName]
  );

  const updateWarehouse = useCallback((id: string, patch: Partial<Warehouse>) => {
    const all = loadAll();
    const next = all.map((w) =>
      w.id === id ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w
    );
    saveAll(next);
    setItems(next);
  }, []);

  const deleteWarehouse = useCallback((id: string) => {
    const all = loadAll().filter((w) => w.id !== id);
    saveAll(all);
    setItems(all);
  }, []);

  return { warehouses: myItems, loading, addWarehouse, updateWarehouse, deleteWarehouse };
}
