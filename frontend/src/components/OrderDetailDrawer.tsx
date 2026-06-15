import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge, PaymentBadge } from "@/components/StatusBadge";
import { TimelineTracker } from "@/components/TimelineTracker";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import type { Order, OrderStatus } from "@/types/logistics";
import {
  User, MapPin, Package, Truck, Printer, XCircle, AlertTriangle,
  Hash, Weight, IndianRupee, Calendar, Box, Copy, RefreshCw, Loader2,
  Zap, Download, ExternalLink, RotateCcw, ShoppingBag, FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import * as orderService from "@/services/orderService";
import * as velocityService from "@/services/velocityService";
import { downloadInvoicePdf, downloadShippingLabelPdf, printShippingLabel } from "@/components/ShippingLabel";
import * as labelInvoiceSettingsService from "@/services/labelInvoiceSettingsService";
import { DEFAULT_LABEL_INVOICE_SETTINGS, type LabelInvoiceSettings } from "@/types/labelInvoice";
import { ApiError } from "@/lib/apiClient";
import { forwardShipmentBlockers } from "@/lib/forwardShipmentValidation";
import { useAuth } from "@/contexts/AuthContext";
import { ProductNameText, SkuBadge } from "@/components/ProductLineDisplay";
import { getFinalLineItemUnitPrice, formatProductPriceInr } from "@/lib/pricing";

/** Local warehouses (Mongo) that may carry a linked Velocity pickup id after linkOnly. */
export interface OrderDetailWarehouseOption {
  id: string;
  warehouseName: string;
  city?: string;
  velocityWarehouseId?: string;
  isDefault?: boolean;
}

const LINK_WH_MESSAGE = "Please link a Velocity warehouse before generating AWB.";
const BACKEND_WH_MESSAGE = "No Velocity warehouse linked. Please link warehouse first.";
/** Match backend Velocity warehouse resolution failures (case-insensitive). */
function isVelocityWarehouseLinkedError(message: string) {
  return message.toLowerCase().includes("no velocity warehouse linked");
}

interface OrderDetailDrawerProps {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onOrderUpdated?: () => void;
  /** Vendor/admin warehouses — used when order.velocityWarehouseId is not set yet. */
  warehouses?: OrderDetailWarehouseOption[];
}

const statusToStep: Record<string, number> = {
  draft: -1, pending: 0, "ready-to-ship": 0, "not-picked": 0,
  "on-process": 1, "in-transit": 2, "out-for-delivery": 3, delivered: 4,
  ndr: 3, rto: 2, cancelled: -1,
};

const timelineSteps = [
  { label: "Order Placed", detail: "Order confirmed & ready" },
  { label: "Picked Up", detail: "Picked from warehouse" },
  { label: "In Transit", detail: "Shipment on the way" },
  { label: "Out for Delivery", detail: "With delivery agent" },
  { label: "Delivered", detail: "Successfully delivered" },
];

const allStatuses: OrderStatus[] = ['pending', 'ready-to-ship', 'not-picked', 'in-transit', 'out-for-delivery', 'delivered', 'ndr', 'rto', 'cancelled'];

const DEV_VELOCITY_WH_CODE = (import.meta.env.VITE_VELOCITY_DEV_WAREHOUSE_CODE as string | undefined)?.trim();
/** Never expose dev warehouse fallback in production builds. */
const CAN_USE_DEV_WH_OVERRIDE = Boolean(import.meta.env.DEV && DEV_VELOCITY_WH_CODE);

function errMsg(err: unknown) {
  if (err instanceof ApiError) {
    const b = err.body as { message?: string; error?: string } | undefined;
    if (b && typeof b.message === "string" && b.message.trim()) return b.message;
    if (b && typeof b.error === "string" && b.error.trim()) return b.error;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

function isPendingCancelEligible(order: Order): boolean {
  if (order.isJunk) return false;
  if (String(order.awb ?? "").trim()) return false;
  if (order.shipmentCreated) return false;
  const st = String(order.status ?? "").toLowerCase().replace(/-/g, "_");
  return st === "pending" || st === "draft";
}

export function OrderDetailDrawer({
  order,
  open,
  onClose,
  onOrderUpdated,
  warehouses = [],
}: OrderDetailDrawerProps) {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const canEditLineSkus = isAdmin;

  const [labelSettings, setLabelSettings] = useState<LabelInvoiceSettings>(DEFAULT_LABEL_INVOICE_SETTINGS);
  const [lineRows, setLineRows] = useState<
    Array<{ name: string; qty: number; price: number; weight: string; sku: string; productCode: string }>
  >([]);
  const [lineSaveLoading, setLineSaveLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<null | "label" | "invoice">(null);

  const [updating, setUpdating] = useState(false);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [liveActivities, setLiveActivities] = useState<Order["trackingActivities"]>(undefined);

  const [selectedWarehouseMongoId, setSelectedWarehouseMongoId] = useState("");
  const [useDevVelocityOverride, setUseDevVelocityOverride] = useState(false);
  const [pendingCancelOpen, setPendingCancelOpen] = useState(false);

  const linkedWarehouses = useMemo(() => {
    const withLink = warehouses.filter((w) => w.velocityWarehouseId?.trim());
    return withLink.sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault));
  }, [warehouses]);

  const warehousesKey = useMemo(
    () => linkedWarehouses.map((w) => `${w.id}:${w.velocityWarehouseId}`).join("|"),
    [linkedWarehouses],
  );

  useEffect(() => {
    if (!open || !order) return;
    setUseDevVelocityOverride(false);
    setSelectedWarehouseMongoId((prev) => {
      if (prev && linkedWarehouses.some((w) => w.id === prev)) return prev;
      return linkedWarehouses[0]?.id ?? "";
    });
  }, [open, order?.id, warehousesKey, linkedWarehouses]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await labelInvoiceSettingsService.getLabelInvoiceSettings();
        if (!cancelled) setLabelSettings({ ...DEFAULT_LABEL_INVOICE_SETTINGS, ...s });
      } catch {
        if (!cancelled) setLabelSettings(DEFAULT_LABEL_INVOICE_SETTINGS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !order) return;
    setLineRows(
      order.products.map((p) => {
        const rec = p as Record<string, unknown>;
        return {
          name: p.name,
          qty: Number(p.qty) || 1,
          price: Number(p.price) || 0,
          weight: String(p.weight ?? ""),
          sku: String(rec.sku ?? "").trim(),
          productCode: String(rec.productCode ?? rec.code ?? "").trim(),
        };
      })
    );
  }, [open, order?.id, order?.updatedAt]);

  if (!order) return null;

  const currentStep = statusToStep[order.status] ?? -1;
  const steps = timelineSteps.map((s, i) => ({
    ...s,
    timestamp: i <= currentStep ? `Apr ${1 + i * 2}, 2026 — ${9 + i * 2}:${15 + i * 10} AM` : "",
  }));

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${text} copied to clipboard`);
  };

  const saveOrderLineItems = async () => {
    if (!canEditLineSkus) return;
    if (lineRows.some((r) => !String(r.sku ?? "").trim())) {
      toast.error("Each line item must have a non-empty SKU before saving.");
      return;
    }
    setLineSaveLoading(true);
    try {
      await orderService.updateOrder(order.id, {
        orderItems: lineRows.map((r) => ({
          name: r.name.trim(),
          qty: r.qty,
          price: r.price,
          weight: r.weight,
          sku: r.sku.trim(),
          ...(r.productCode.trim() ? { productCode: r.productCode.trim() } : {}),
        })),
      });
      toast.success("Line items updated");
      onOrderUpdated?.();
    } catch (err: unknown) {
      toast.error(`Save failed: ${errMsg(err)}`);
    } finally {
      setLineSaveLoading(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    setUpdating(true);
    try {
      await orderService.updateOrderStatus(order.id, newStatus);
      toast.success(`Order ${order.id} status updated to ${newStatus}`);
      onOrderUpdated?.();
    } catch (err: unknown) {
      toast.error(`Failed: ${errMsg(err)}`);
    } finally {
      setUpdating(false);
    }
  };

  const cancelOrder = async () => {
    if (!order) return;

    const awbToCancel = order.awb;
    if (awbToCancel) {
      if (!confirm(`Cancel order ${order.id}?`)) return;
      setUpdating(true);
      try {
        await velocityService.cancelShipment({ awbs: [awbToCancel], orderId: order.id });
        toast.success(`Shipment ${awbToCancel} cancellation requested`);
        onOrderUpdated?.();
        return;
      } catch (err: unknown) {
        toast.error(`Cancel failed: ${errMsg(err)}`);
      } finally {
        setUpdating(false);
      }
      return;
    }

    if (isPendingCancelEligible(order)) {
      setPendingCancelOpen(true);
      return;
    }

    if (!confirm(`Cancel order ${order.id}?`)) return;
    await updateStatus("cancelled");
  };

  const movePendingToReship = async () => {
    if (!order) return;
    setUpdating(true);
    try {
      await orderService.moveOrderToReship(order.id);
      toast.success("Order moved to reship");
      setPendingCancelOpen(false);
      onOrderUpdated?.();
    } catch (err: unknown) {
      toast.error(errMsg(err));
    } finally {
      setUpdating(false);
    }
  };

  const movePendingToJunk = async () => {
    if (!order) return;
    setUpdating(true);
    try {
      await orderService.moveOrderToJunk(order.id);
      toast.success("Order moved to junk");
      setPendingCancelOpen(false);
      onOrderUpdated?.();
    } catch (err: unknown) {
      toast.error(errMsg(err));
    } finally {
      setUpdating(false);
    }
  };

  /** Resolves warehouse for Velocity — prefer live pickup via Mongo id over stale order velocity code. */
  function velocityWarehousePayload():
    | { warehouseId: string }
    | { warehouse_id: string }
    | Record<string, never> {
    const pickupMongoId =
      (order.pickupAddressId && String(order.pickupAddressId).trim()) ||
      (selectedWarehouseMongoId && String(selectedWarehouseMongoId).trim()) ||
      "";
    if (pickupMongoId) return { warehouseId: pickupMongoId };
    if (useDevVelocityOverride && isAdmin && CAN_USE_DEV_WH_OVERRIDE && DEV_VELOCITY_WH_CODE) {
      return { warehouse_id: DEV_VELOCITY_WH_CODE };
    }
    return {};
  }

  function validateWarehouseBeforeShip(): boolean {
    const pickupMongoId =
      (order.pickupAddressId && String(order.pickupAddressId).trim()) ||
      (selectedWarehouseMongoId && String(selectedWarehouseMongoId).trim()) ||
      "";
    if (pickupMongoId) return true;
    if (useDevVelocityOverride && isAdmin && CAN_USE_DEV_WH_OVERRIDE && DEV_VELOCITY_WH_CODE)
      return true;
    if (order.velocityWarehouseId?.trim()) return true;
    toast.error(LINK_WH_MESSAGE);
    return false;
  }

  const generateAwb = async () => {
    if (!validateWarehouseBeforeShip()) return;
    const issues = forwardShipmentBlockers(order);
    if (issues.length) {
      toast.error("Fix delivery details before creating a shipment.", {
        description: issues.slice(0, 4).join(" "),
      });
      return;
    }
    setShippingLoading(true);
    try {
      const wh = velocityWarehousePayload();
      const resp = await velocityService.createForwardShipment({ orderId: order.id, ...wh });
      const d = resp.data;
      const lines = [
        `AWB: ${d.awb_code}`,
        d.carrier_name && `Courier: ${d.carrier_name}`,
        d.shipment_id && `Velocity shipment: ${d.shipment_id}`,
        d.status && `Status: ${d.status}`,
        d.label_url && "Label URL saved on order",
        d.shipping_charges != null && `Charges: ₹${d.shipping_charges}`,
      ].filter(Boolean) as string[];
      toast.success("Shipment created", { description: lines.join(" · ") });
      if (resp.walletDeduction?.debited && typeof resp.walletDeduction.amount === "number") {
        toast.info(`Wallet debited ₹${resp.walletDeduction.amount} for shipping`);
      }
      onOrderUpdated?.();
    } catch (err: unknown) {
      const message = errMsg(err);
      const normalized = message.toLowerCase();
      if (err instanceof ApiError && err.status === 402) {
        toast.error("Insufficient wallet balance", { description: message });
      } else if (isVelocityWarehouseLinkedError(message)) {
        toast.error(BACKEND_WH_MESSAGE);
      } else if (normalized.includes("not serviceable") || normalized.includes("serviceability")) {
        toast.error("Serviceability check failed", { description: message });
      } else if (normalized.includes("order already exists in velocity") || normalized.includes("order already exists")) {
        toast.error("This order already exists in Velocity. Try resync tracking or create shipment with a new shipment attempt.");
      } else if (normalized.includes("already") && (normalized.includes("awb") || normalized.includes("shipment"))) {
        toast.info("AWB already exists for this order");
      } else {
        toast.error(`AWB generation failed: ${message}`);
      }
    } finally {
      setShippingLoading(false);
    }
  };

  const fetchLiveTracking = async () => {
    const awb = order.awb;
    if (!awb) {
      toast.error("No AWB on this order yet");
      return;
    }
    setTrackingLoading(true);
    try {
      const resp = await velocityService.trackShipment({ awb, orderId: order.id });
      setLiveActivities(resp.data.activities);
      toast.success("Tracking updated");
      onOrderUpdated?.();
    } catch (err: unknown) {
      toast.error(`Tracking failed: ${errMsg(err)}`);
    } finally {
      setTrackingLoading(false);
    }
  };

  const createReturnPickup = async () => {
    if (!confirm(`Create return pickup for order ${order.id}?`)) return;
    if (!validateWarehouseBeforeShip()) return;
    setShippingLoading(true);
    try {
      const wh = velocityWarehousePayload();
      const resp = await velocityService.createReverseShipment({ orderId: order.id, ...wh });
      toast.success(`Return pickup created: AWB ${resp.data.awb_code}`);
      onOrderUpdated?.();
    } catch (err: unknown) {
      const message = errMsg(err);
      if (isVelocityWarehouseLinkedError(message)) {
        toast.error(BACKEND_WH_MESSAGE);
      } else {
        toast.error(`Return pickup failed: ${message}`);
      }
    } finally {
      setShippingLoading(false);
    }
  };

  const hasOrderWarehouse = Boolean(order.velocityWarehouseId?.trim());
  const noLinkedPickupLocations = linkedWarehouses.length === 0;
  const cannotShipWithoutExtra =
    !hasOrderWarehouse && noLinkedPickupLocations && !(isAdmin && CAN_USE_DEV_WH_OVERRIDE);

  const showWarehousePicker =
    !order.awb && !hasOrderWarehouse && linkedWarehouses.length > 0 && !useDevVelocityOverride;

  const showDevOverrideToggle = isAdmin && CAN_USE_DEV_WH_OVERRIDE && !order.awb && !hasOrderWarehouse;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto p-0">
        <SheetHeader className="p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <SheetTitle className="text-base">Order {order.id}</SheetTitle>
              <p className="text-xs text-text-muted mt-0.5">{order.date}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>
        </SheetHeader>

        <div className="p-5 space-y-5">
          <section>
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              <User className="h-3.5 w-3.5" /> Customer Information
            </h4>
            <div className="rounded-xl border border-border bg-surface-2/50 p-4 space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-primary font-semibold text-sm">
                  {(order.customer || "?").charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">{order.customer}</p>
                  <p className="text-xs text-text-muted">{order.phone}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 text-sm text-text-secondary">
                <MapPin className="h-3.5 w-3.5 mt-0.5 text-text-muted shrink-0" />
                <span>
                  {order.address}, {order.city} — {order.pincode}
                </span>
              </div>
            </div>
          </section>

          {(() => {
            const raw = order.pickupAddress;
            const po =
              raw && typeof raw === "object"
                ? (raw as {
                    label?: string;
                    warehouseName?: string;
                    contactName?: string;
                    phone?: string;
                    alternatePhone?: string;
                    email?: string;
                    city?: string;
                    state?: string;
                    pincode?: string;
                    address?: string;
                    gstin?: string;
                    velocityWarehouseId?: string;
                  })
                : null;
            const warehouseTitle =
              (po?.warehouseName && String(po.warehouseName).trim()) ||
              (po?.label && String(po.label).trim()) ||
              (typeof raw === "string" ? raw.trim() : "");
            const hasPickupRef = Boolean(order.pickupAddressId);
            if (!warehouseTitle && !hasPickupRef) return null;
            return (
              <section>
                <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                  <MapPin className="h-3.5 w-3.5" /> Pickup / Warehouse
                </h4>
                <div className="rounded-xl border border-border bg-surface-2/50 p-4 space-y-2 text-sm text-text-secondary">
                  <p className="font-medium text-text-primary">
                    {warehouseTitle || (hasPickupRef ? "Pickup address" : "—")}
                  </p>
                  {po?.contactName || po?.phone || (po as { contactPerson?: string }).contactPerson ? (
                    <p className="text-xs">
                      {(po?.contactName || (po as { contactPerson?: string }).contactPerson) ? (
                        <span>{po?.contactName || (po as { contactPerson?: string }).contactPerson}</span>
                      ) : null}
                      {(po?.contactName || (po as { contactPerson?: string }).contactPerson) && po?.phone ? (
                        <span className="text-text-muted"> · </span>
                      ) : null}
                      {po?.phone ? <span>{po.phone}</span> : null}
                      {po?.alternatePhone ? (
                        <span className="block text-text-muted mt-0.5">Alt: {po.alternatePhone}</span>
                      ) : null}
                    </p>
                  ) : null}
                  {(po?.city || po?.state || po?.pincode) && (
                    <p className="text-xs">
                      {[po?.city, po?.state].filter(Boolean).join(", ")}
                      {po?.pincode ? ` · ${po.pincode}` : ""}
                    </p>
                  )}
                  {po?.address ? <p className="text-xs leading-relaxed text-text-muted">{po.address}</p> : null}
                  {po?.gstin ? <p className="text-xs">GSTIN: {po.gstin}</p> : null}
                  {hasPickupRef && !warehouseTitle && !po?.address && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Pickup details are no longer available (address may have been removed). Order snapshot may still be on file.
                    </p>
                  )}
                  {!order.velocityWarehouseId?.trim() && po?.velocityWarehouseId?.trim() ? (
                    <p className="text-[11px] font-mono text-text-muted pt-1">
                      Velocity warehouse: {po.velocityWarehouseId}
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })()}

          {(order.externalSource === "shopify" ||
            order.channel === "Shopify" ||
            order.externalOrderName ||
            order.shopifyOrderNumericId) && (
            <section>
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                <ShoppingBag className="h-3.5 w-3.5" /> Shopify
              </h4>
              <div className="rounded-xl border border-border bg-surface-2/50 p-4 space-y-2 text-sm text-text-secondary">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-[#96bf48]/15 px-2 py-0.5 text-xs font-medium text-[#3d5c00] border border-[#96bf48]/25">
                    Shopify
                  </span>
                  {order.sourceType ? (
                    <span className="text-xs text-text-muted">source: {order.sourceType}</span>
                  ) : null}
                </div>
                <dl className="grid grid-cols-1 gap-1.5 text-xs">
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    <dt className="text-text-muted shrink-0">Order #</dt>
                    <dd className="font-mono text-text-primary break-all">
                      {order.externalOrderName?.trim() ||
                        (order.shopifyOrderNumericId ? `#${order.shopifyOrderNumericId}` : "—")}
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    <dt className="text-text-muted shrink-0">Store</dt>
                    <dd className="font-mono text-text-primary break-all">{order.shopifyShopDomain?.trim() || "—"}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    <dt className="text-text-muted shrink-0">Payment (Shopify)</dt>
                    <dd className="capitalize">{order.shopifyFinancialStatus?.trim() || "—"}</dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    <dt className="text-text-muted shrink-0">Fulfillment (Shopify)</dt>
                    <dd className="capitalize">{order.shopifyFulfillmentStatus?.trim() || "—"}</dd>
                  </div>
                  {order.lastShopifySyncAt ? (
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                      <dt className="text-text-muted shrink-0">Last Shopify sync</dt>
                      <dd>{new Date(order.lastShopifySyncAt).toLocaleString()}</dd>
                    </div>
                  ) : null}
                </dl>
                {order.shopifyNote?.trim() ? (
                  <p className="text-xs pt-1 border-t border-border/60">
                    <span className="text-text-muted">Note: </span>
                    {order.shopifyNote}
                  </p>
                ) : null}
                {order.shopifyTags?.trim() ? (
                  <p className="text-xs">
                    <span className="text-text-muted">Tags: </span>
                    {order.shopifyTags}
                  </p>
                ) : null}
                <p className="text-xs text-text-muted pt-1 border-t border-border/60">
                  Sync updates line items and customer details. Local shipment / AWB is preserved when already set.
                </p>
              </div>
            </section>
          )}

          {order.statusHistory && order.statusHistory.length > 0 && (
            <section>
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                <Calendar className="h-3.5 w-3.5" /> Status history
              </h4>
              <ul className="rounded-xl border border-border bg-card p-3 space-y-2 text-xs">
                {[...order.statusHistory].reverse().map((e, i) => (
                  <li key={i} className="flex justify-between gap-2 border-b border-border/60 last:border-0 pb-2 last:pb-0">
                    <span className="font-medium text-text-primary capitalize">{e.status.replace(/_/g, " ")}</span>
                    <span className="text-text-muted shrink-0">
                      {e.at ? new Date(e.at).toLocaleString() : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              <Truck className="h-3.5 w-3.5" /> Shipment Details
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  icon: Hash,
                  label: "AWB",
                  value: order.awb || order.velocityShipmentId || "—",
                  copyable: true,
                },
                { icon: Truck, label: "Courier", value: order.courierName || order.courier || "—" },
                { icon: Weight, label: "Weight", value: order.weight },
                { icon: IndianRupee, label: "Amount", value: `₹${order.amount}` },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <item.icon className="h-3 w-3 text-text-muted" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                      {item.label}
                    </span>
                    {item.copyable && item.value !== "—" && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(item.value)}
                        className="ml-auto text-text-muted hover:text-primary"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-text-primary font-mono">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <PaymentBadge type={order.payment} />
            </div>

            {hasOrderWarehouse && (
              <p className="text-[11px] text-text-muted mt-2 font-mono">
                Velocity warehouse: {order.velocityWarehouseId}
              </p>
            )}

            {(order.shippingCharges !== undefined || order.codCharges !== undefined) && (
              <div className="mt-3 rounded-lg border border-border bg-surface-2/40 p-3 grid grid-cols-3 gap-2 text-center">
                {order.shippingCharges !== undefined && (
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">Shipping</p>
                    <p className="text-sm font-semibold text-text-primary">₹{order.shippingCharges}</p>
                  </div>
                )}
                {order.codCharges !== undefined && (
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">COD Fee</p>
                    <p className="text-sm font-semibold text-text-primary">₹{order.codCharges}</p>
                  </div>
                )}
                {order.rtoCharges !== undefined && (
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">RTO</p>
                    <p className="text-sm font-semibold text-text-primary">₹{order.rtoCharges}</p>
                  </div>
                )}
              </div>
            )}

            {order.labelUrl && /^https?:\/\//i.test(String(order.labelUrl)) && (
              <div className="mt-3 flex gap-2">
                <a href={order.labelUrl} download className="flex-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 h-9 text-text-secondary hover:text-primary hover:border-primary/30"
                  >
                    <Download className="h-3.5 w-3.5" /> Download Label
                  </Button>
                </a>
                <a href={order.labelUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 h-9 text-text-secondary hover:text-primary hover:border-primary/30"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open Label
                  </Button>
                </a>
              </div>
            )}
            {order.manifestUrl && /^https?:\/\//i.test(String(order.manifestUrl)) && (
              <div className="mt-2 flex gap-2">
                <a href={order.manifestUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 h-9 text-text-secondary hover:text-primary hover:border-primary/30"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open manifest
                  </Button>
                </a>
              </div>
            )}
          </section>

          <section>
            <h4 className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              <span className="flex items-center gap-2">
                <Box className="h-3.5 w-3.5" /> Products
              </span>
              {canEditLineSkus && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={lineSaveLoading}
                  onClick={() => void saveOrderLineItems()}
                >
                  {lineSaveLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Save SKUs
                </Button>
              )}
            </h4>
            <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
              {lineRows.map((p, i) => (
                <div key={i} className="p-3 space-y-2 bg-card">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-light/50">
                      <Package className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-text-muted mb-1">Product Name</p>
                      <ProductNameText product={{ name: p.name }} />
                      <div className="mt-2">
                        <p className="text-[10px] uppercase tracking-wide text-text-muted mb-1">SKU</p>
                        <SkuBadge product={{ sku: p.sku }} index={i} />
                      </div>
                      <p className="text-xs text-text-muted mt-1">
                        {p.weight || "—"} · {formatProductPriceInr(getFinalLineItemUnitPrice(p))} · Qty {p.qty}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-0 sm:pl-12">
                    <div>
                      <Label className="text-[10px] text-text-muted">Product code</Label>
                      <Input
                        className="h-8 mt-0.5 bg-background text-text-primary border-border"
                        value={p.productCode}
                        disabled={!canEditLineSkus}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLineRows((rows) => rows.map((r, j) => (j === i ? { ...r, productCode: v } : r)));
                        }}
                        placeholder="—"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-text-muted">SKU ID *</Label>
                      <Input
                        className="h-8 mt-0.5 bg-background text-text-primary border-border"
                        value={p.sku}
                        disabled={!canEditLineSkus}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLineRows((rows) => rows.map((r, j) => (j === i ? { ...r, sku: v } : r)));
                        }}
                        placeholder="Required for labels"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <section>
            <h4 className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              <span className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" /> Shipment Timeline
              </span>
              {order.awb && (
                <button
                  type="button"
                  onClick={fetchLiveTracking}
                  disabled={trackingLoading}
                  className="flex items-center gap-1 text-[10px] text-primary hover:opacity-80 disabled:opacity-50"
                >
                  {trackingLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Refresh
                </button>
              )}
            </h4>

            {(liveActivities ?? order.trackingActivities)?.length ? (
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {(liveActivities ?? order.trackingActivities)!.map((act, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-text-primary font-medium">{act.activity}</p>
                      <span className="text-[10px] text-text-muted whitespace-nowrap">{act.date}</span>
                    </div>
                    {act.location && (
                      <p className="text-xs text-text-muted mt-0.5">{act.location}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-4">
                <TimelineTracker steps={steps} currentStep={currentStep} />
              </div>
            )}
          </section>

          <Separator />

          <section>
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              <RefreshCw className="h-3.5 w-3.5" /> Update Status
            </h4>
            <Select onValueChange={updateStatus} disabled={updating}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Change status..." />
              </SelectTrigger>
              <SelectContent>
                {allStatuses
                  .filter((s) => s !== order.status)
                  .map((s) => (
                    <SelectItem key={s} value={s}>
                      {s
                        .replace(/-/g, " ")
                        .replace(/\b\w/g, (l) => l.toUpperCase())}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {updating && (
              <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Updating...
              </p>
            )}
          </section>

          <Separator />

          {!order.awb && cannotShipWithoutExtra && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Velocity warehouse required</AlertTitle>
              <AlertDescription>{LINK_WH_MESSAGE}</AlertDescription>
            </Alert>
          )}

          {showWarehousePicker && (
            <div className="space-y-2">
              <Label className="text-xs text-text-muted">Pickup warehouse (Velocity linked)</Label>
              <Select
                value={selectedWarehouseMongoId}
                onValueChange={setSelectedWarehouseMongoId}
                disabled={shippingLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose warehouse..." />
                </SelectTrigger>
                <SelectContent>
                  {linkedWarehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.warehouseName}
                      {w.city ? ` (${w.city})` : ""}
                      {w.velocityWarehouseId ? ` · ${w.velocityWarehouseId}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showDevOverrideToggle && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <Checkbox
                id="dev-velocity-wh"
                checked={useDevVelocityOverride}
                onCheckedChange={(v) => setUseDevVelocityOverride(v === true)}
              />
              <label htmlFor="dev-velocity-wh" className="text-xs cursor-pointer text-text-muted">
                Admin/dev: use <code className="text-[10px]">VITE_VELOCITY_DEV_WAREHOUSE_CODE</code> from{" "}
                <code>.env</code> (never in production bundles).
              </label>
            </div>
          )}

          <section>
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              Quick Actions
            </h4>
            <div className="grid grid-cols-2 gap-2 pb-4">
              {!order.awb && (
                <Button
                  className="gap-2 h-10 bg-primary text-primary-foreground hover:bg-primary/90 col-span-2"
                  onClick={generateAwb}
                  disabled={
                    shippingLoading ||
                    updating ||
                    cannotShipWithoutExtra ||
                    (showWarehousePicker && !selectedWarehouseMongoId && !useDevVelocityOverride)
                  }
                >
                  {shippingLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Generate AWB / Ship Now
                </Button>
              )}

              <div className="col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  className="gap-2 h-10 text-text-secondary hover:text-primary hover:border-primary/30"
                  onClick={() => printShippingLabel(order, labelSettings)}
                >
                  <Printer className="h-4 w-4" /> Print Label
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 h-10 text-text-secondary hover:text-primary hover:border-primary/30"
                  disabled={pdfLoading !== null}
                  onClick={() => {
                    setPdfLoading("label");
                    void downloadShippingLabelPdf(order, labelSettings)
                      .then(() => toast.success("Label PDF downloaded"))
                      .catch((err: unknown) => toast.error(errMsg(err)))
                      .finally(() => setPdfLoading(null));
                  }}
                >
                  {pdfLoading === "label" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  Label PDF
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 h-10 text-text-secondary hover:text-primary hover:border-primary/30"
                  disabled={pdfLoading !== null}
                  onClick={() => {
                    setPdfLoading("invoice");
                    void downloadInvoicePdf(order, labelSettings)
                      .then(() => toast.success("Invoice PDF downloaded"))
                      .catch((err: unknown) => toast.error(errMsg(err)))
                      .finally(() => setPdfLoading(null));
                  }}
                >
                  {pdfLoading === "invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  Invoice PDF
                </Button>
              </div>
              <Button
                variant="outline"
                className="gap-2 h-10 text-warning hover:bg-warning-light hover:border-warning/30"
                onClick={() => updateStatus("ndr")}
              >
                <AlertTriangle className="h-4 w-4" /> Raise NDR
              </Button>

              {(order.status === "delivered" || order.status === "ndr") && (
                <Button
                  variant="outline"
                  className="gap-2 h-10 text-text-secondary hover:text-primary hover:border-primary/30 col-span-2"
                  onClick={createReturnPickup}
                  disabled={
                    shippingLoading ||
                    cannotShipWithoutExtra ||
                    (showWarehousePicker && !selectedWarehouseMongoId && !useDevVelocityOverride)
                  }
                >
                  {shippingLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  Create Return Pickup
                </Button>
              )}

              <Button
                variant="outline"
                className="gap-2 h-10 text-danger hover:bg-danger-light hover:border-danger/30 col-span-2"
                onClick={cancelOrder}
                disabled={updating}
              >
                <XCircle className="h-4 w-4" /> Cancel Order
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>

      <AlertDialog open={pendingCancelOpen} onOpenChange={setPendingCancelOpen}>
        <AlertDialogContent className="sm:max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogDescription className="text-sm text-text-primary">
              This pending order has not shipped yet. Choose where to send it:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <AlertDialogCancel disabled={updating}>Keep order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-primary-foreground hover:bg-primary-dark"
              disabled={updating}
              onClick={() => void movePendingToReship()}
            >
              Send to Reship
            </AlertDialogAction>
            <AlertDialogAction
              className="border border-danger text-danger bg-transparent hover:bg-danger-light"
              disabled={updating}
              onClick={() => void movePendingToJunk()}
            >
              Send to Junk
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
