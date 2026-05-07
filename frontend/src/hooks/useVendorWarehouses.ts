import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import * as warehouseService from "@/services/warehouseService";

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
  /** Velocity pickup id after linkOnly (e.g. WHZBRR). */
  velocityWarehouseId?: string;
  createdAt: string;
  updatedAt: string;
}

function mapDoc(r: Record<string, unknown>, vendorName: string, vendorUserId: string): Warehouse {
  return {
    id: String(r._id ?? r.id ?? ""),
    vendorId: String(r.vendorId ?? vendorUserId),
    vendorName,
    warehouseName: String(r.name ?? r.warehouseName ?? ""),
    contactPerson: String(r.contactName ?? r.contactPerson ?? ""),
    phoneNumber: String(r.phone ?? r.phoneNumber ?? ""),
    email: String(r.email ?? ""),
    addressLine1: String(r.addressLine1 ?? ""),
    addressLine2: (r.addressLine2 as string) || undefined,
    landmark: (r.landmark as string) || undefined,
    city: String(r.city ?? ""),
    state: String(r.state ?? ""),
    pincode: String(r.pincode ?? ""),
    country: String(r.country ?? "India"),
    warehouseType: String(r.warehouseType ?? "Warehouse"),
    status: r.isActive === false ? "Inactive" : ((r.status as Warehouse["status"]) || "Active"),
    isDefault: Boolean(r.isDefault),
    gstNumber: (r.gstNumber as string) || undefined,
    notes: (r.notes as string) || undefined,
    velocityWarehouseId:
      typeof r.velocityWarehouseId === "string" && r.velocityWarehouseId.trim()
        ? r.velocityWarehouseId.trim()
        : undefined,
    createdAt: String(r.createdAt ?? new Date().toISOString()),
    updatedAt: String(r.updatedAt ?? new Date().toISOString()),
  };
}

export function useVendorWarehouses() {
  const { userId, userName, user } = useAuth();
  const vendorName = user?.name || userName || "Vendor";
  const vid = userId || "";

  const [items, setItems] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = (await warehouseService.listWarehouses()) as unknown as Record<string, unknown>[];
      setItems(rows.map((r) => mapDoc(r, vendorName, vid)));
      setError(null);
    } catch {
      setItems([]);
      setError("Failed to load warehouses. Please try again or sign in again.");
    } finally {
      setLoading(false);
    }
  }, [vendorName, vid]);

  useEffect(() => {
    void load();
  }, [load]);

  const myItems = items;

  const addWarehouse = useCallback(
    async (data: Omit<Warehouse, "id" | "vendorId" | "vendorName" | "createdAt" | "updatedAt">) => {
      await warehouseService.createWarehouse({
        name: data.warehouseName,
        contactName: data.contactPerson,
        phone: data.phoneNumber,
        email: data.email,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        isDefault: data.isDefault,
      });
      await load();
    },
    [load]
  );

  const updateWarehouse = useCallback(
    async (id: string, patch: Partial<Warehouse>) => {
      await warehouseService.updateWarehouse(id, patch as Record<string, unknown>);
      await load();
    },
    [load]
  );

  const deleteWarehouse = useCallback(
    async (id: string) => {
      await warehouseService.deleteWarehouse(id);
      await load();
    },
    [load]
  );

  return {
    warehouses: myItems,
    loading,
    error,
    addWarehouse,
    updateWarehouse,
    deleteWarehouse,
    refetch: load,
  };
}
