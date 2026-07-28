import { useSearchParams } from "react-router-dom";
import { useState, useEffect, Suspense } from "react";
import {
  Package,
  MapPin,
  Truck,
  Phone,
  User,
  CreditCard,
  Calendar,
  Weight,
  Ruler,
  Printer,
  RefreshCw,
  AlertTriangle,
  XCircle,
  FileDown,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadInvoicePdf, downloadShippingLabelPdf, printShippingLabel } from "@/components/ShippingLabel";
import * as labelInvoiceSettingsService from "@/services/labelInvoiceSettingsService";
import { DEFAULT_LABEL_INVOICE_SETTINGS, type LabelInvoiceSettings } from "@/types/labelInvoice";
import { TimelineTracker } from "@/components/TimelineTracker";
import { cn } from "@/lib/utils";
import * as orderService from "@/services/orderService";
import * as velocityService from "@/services/velocityService";
import { getStoredToken } from "@/lib/apiClient";
import type { Order } from "@/types/logistics";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ProductNameText, SkuBadge } from "@/components/ProductLineDisplay";
import { getFinalLineItemUnitPrice, formatProductPriceInr } from "@/lib/pricing";

const statusColors: Record<string, string> = {
  delivered: "bg-success-light text-success-dark",
  in_transit: "bg-primary-light text-primary-dark",
  "in-transit": "bg-primary-light text-primary-dark",
  out_for_delivery: "bg-secondary-light text-secondary-dark",
  "out-for-delivery": "bg-secondary-light text-secondary-dark",
  ndr: "bg-warning-light text-warning-dark",
  rto: "bg-danger-light text-danger-dark",
  pending: "bg-surface-2 text-text-muted",
  ready_to_ship: "bg-accent text-accent-foreground",
  "ready-to-ship": "bg-accent text-accent-foreground",
  ready_for_pickup: "bg-warning-light text-warning-dark",
  pending_pickup: "bg-warning-light text-warning-dark",
  pickup_scheduled: "bg-warning-light text-warning-dark",
  "not-picked": "bg-warning-light text-warning-dark",
  cancelled: "bg-surface-2 text-text-muted",
  draft: "bg-surface-2 text-text-muted",
};

/** Status options offered in Update Status (API accepts hyphen or snake_case). */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "ready_to_ship", label: "Ready to Ship" },
  { value: "pickup_scheduled", label: "Pending Pickup" },
  { value: "picked_up", label: "Picked Up" },
  { value: "in_transit", label: "In Transit" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "ndr", label: "NDR" },
  { value: "rto", label: "RTO" },
  { value: "cancelled", label: "Cancelled" },
];

const NDR_REASONS = [
  "Customer not available",
  "Wrong address",
  "Customer refused",
  "Phone not reachable",
  "COD amount issue",
];

function normalizeStatusKey(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

function formatStatusLabel(raw: unknown): string {
  return normalizeStatusKey(raw).replace(/_/g, " ") || "—";
}

function formatDisplayDateTime(raw: unknown): string | undefined {
  if (raw == null || raw === "" || raw === "—") return undefined;
  const s = String(raw).trim();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  // Keep courier-provided strings as-is when they aren't ISO parseable
  return s || undefined;
}

function formatEddDisplay(raw: unknown): string | undefined {
  if (raw == null || raw === "" || raw === "—") return undefined;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return String(raw).trim() || undefined;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Map status history / shipment status to milestone index (real data only). */
const MILESTONE_DEFS = [
  { key: "placed", label: "Order Placed", match: ["draft", "pending", "created", "order_placed"] },
  { key: "ready", label: "Ready to Ship", match: ["ready_to_ship", "rts"] },
  {
    key: "pickup",
    label: "Pending Pickup",
    match: ["pickup_scheduled", "pending_pickup", "ready_for_pickup", "not_picked", "picked_up"],
  },
  { key: "transit", label: "In Transit", match: ["in_transit", "shipped", "picked_up"] },
  { key: "ofd", label: "Out for Delivery", match: ["out_for_delivery"] },
  { key: "delivered", label: "Delivered", match: ["delivered"] },
] as const;

function statusMatchesMilestone(statusKey: string, match: readonly string[]): boolean {
  return match.some((m) => statusKey === m || statusKey.includes(m));
}

function buildRealMilestoneSteps(order: Order): {
  steps: { label: string; detail?: string; timestamp?: string }[];
  currentStep: number;
} {
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const firstAtByMilestone: (string | undefined)[] = MILESTONE_DEFS.map(() => undefined);

  // Order placed date from order.date when available (real order date, not fabricated)
  const placed = formatDisplayDateTime(order.date) || formatDisplayDateTime(order.createdAt);
  if (placed) firstAtByMilestone[0] = placed;

  for (const ev of history) {
    const key = normalizeStatusKey(ev.status);
    const at = formatDisplayDateTime(ev.at);
    if (!at) continue;
    for (let i = 0; i < MILESTONE_DEFS.length; i++) {
      if (statusMatchesMilestone(key, MILESTONE_DEFS[i]!.match) && !firstAtByMilestone[i]) {
        firstAtByMilestone[i] = at;
      }
    }
  }

  const effective = normalizeStatusKey(order.shipmentStatus || order.status);
  let currentStep = 0;
  for (let i = MILESTONE_DEFS.length - 1; i >= 0; i--) {
    if (statusMatchesMilestone(effective, MILESTONE_DEFS[i]!.match)) {
      currentStep = i;
      break;
    }
  }
  // Pickup-scheduled / ready_for_pickup sit on Pending Pickup (index 2), not In Transit
  if (
    ["pickup_scheduled", "pending_pickup", "ready_for_pickup", "not_picked"].includes(effective)
  ) {
    currentStep = 2;
  } else if (effective === "picked_up") {
    currentStep = 3;
  } else if (effective === "ready_to_ship" || effective === "rts") {
    currentStep = 1;
  }

  const steps = MILESTONE_DEFS.map((m, i) => ({
    label: m.label,
    // Only attach a timestamp when we actually have one — never invent dates
    timestamp: firstAtByMilestone[i],
  }));

  return { steps, currentStep };
}

function notifyOrdersListRefresh(orderId: string, status?: string) {
  try {
    window.opener?.postMessage(
      { type: "shipamaze:order-updated", orderId, status },
      window.location.origin
    );
  } catch {
    /* ignore cross-origin */
  }
  try {
    localStorage.setItem(
      "shipamaze_order_updated",
      JSON.stringify({ orderId, status, at: Date.now() })
    );
  } catch {
    /* ignore quota */
  }
}

function toDisplayOrder(data: Order): Order {
  const weightRaw = data.weight;
  const weight =
    weightRaw == null || weightRaw === ""
      ? "—"
      : String(weightRaw).toLowerCase().includes("kg")
        ? String(weightRaw)
        : `${weightRaw} kg`;
  const dims =
    data.dimensions ||
    (data.length || data.width || data.height
      ? `${data.length || 0}x${data.width || data.breadth || 0}x${data.height || 0} cm`
      : "");
  return {
    ...data,
    weight,
    dimensions: dims,
    courier: data.courierName || data.courier || "—",
    awb: data.awb || data.trackingId || "—",
    products: Array.isArray(data.products) ? data.products : [],
  };
}

export default function PublicOrderDetail() {
  const [params] = useSearchParams();
  const orderId = params.get("id");
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [labelSettings, setLabelSettings] = useState<LabelInvoiceSettings>(DEFAULT_LABEL_INVOICE_SETTINGS);
  const [pdfLoading, setPdfLoading] = useState<null | "label" | "invoice">(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [liveActivities, setLiveActivities] = useState<
    Array<{ date: string; activity: string; location: string }> | null
  >(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [ndrOpen, setNdrOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [ndrReason, setNdrReason] = useState("");
  const [newStatus, setNewStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    void labelInvoiceSettingsService
      .getPublicLabelInvoiceSettings()
      .then((s) => {
        if (!cancelled) setLabelSettings({ ...DEFAULT_LABEL_INVOICE_SETTINGS, ...s });
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    setLiveActivities(null);

    const fetchOrder = async () => {
      setLoading(true);
      try {
        const token = getStoredToken();
        if (token) {
          try {
            const data = await orderService.getOrder(orderId);
            if (data?.id) {
              setOrder(toDisplayOrder(data));
              return;
            }
          } catch {
            /* fall through to public endpoints */
          }
        }

        try {
          const data = await orderService.getPublicOrder(orderId);
          if (data?.id) {
            const location = [data.city, data.state].filter(Boolean).join(", ") || "—";
            setOrder(
              toDisplayOrder({
                id: data.id ?? orderId,
                customer: "Recipient",
                phone: data.customerPhoneMasked || "—",
                address: location,
                city: data.city || "—",
                pincode: data.pincodeMasked || "—",
                weight: "—",
                courier: data.courier || data.courierName || "—",
                payment: (data.payment as Order["payment"]) ?? "Prepaid",
                status: data.status as Order["status"],
                shipmentStatus: data.shipmentStatus,
                date: data.date || "—",
                awb: data.awb || "—",
                amount: 0,
                products: [],
                trackingActivities: data.trackingActivities ?? [],
                edd: data.estimatedDelivery ?? undefined,
              })
            );
            return;
          }
        } catch {
          /* try AWB */
        }

        try {
          const data = await orderService.trackByAwb(orderId);
          if (data?.id) {
            const location = [data.city, data.state].filter(Boolean).join(", ") || "—";
            setOrder(
              toDisplayOrder({
                id: data.id,
                customer: "Recipient",
                phone: data.customerPhoneMasked || "—",
                address: location,
                city: data.city || "—",
                pincode: data.pincodeMasked || "—",
                weight: "—",
                courier: data.courier || data.courierName || "—",
                payment: (data.payment as Order["payment"]) ?? "Prepaid",
                status: data.status as Order["status"],
                shipmentStatus: data.shipmentStatus,
                date: data.date || "—",
                awb: data.awb || "—",
                amount: 0,
                products: [],
                trackingActivities: data.trackingActivities ?? [],
                edd: data.estimatedDelivery ?? undefined,
              })
            );
            return;
          }
        } catch {
          setOrder(null);
        }
        setOrder(null);
      } finally {
        setLoading(false);
      }
    };
    void fetchOrder();
  }, [orderId]);

  const refreshLiveTracking = async (opts?: { silent?: boolean }) => {
    if (!order) return;
    const awb = String(order.awb || "").trim();
    if (!awb || awb === "—" || awb === "N/A") return;
    setTrackingLoading(true);
    try {
      if (getStoredToken()) {
        const resp = await velocityService.trackShipment({ awb, orderId: order.id });
        const activities = resp.data?.activities ?? [];
        setLiveActivities(activities);
        if (resp.data?.status) {
          setOrder((prev) =>
            prev
              ? {
                  ...prev,
                  shipmentStatus: resp.data.status,
                  trackingActivities: activities.length ? activities : prev.trackingActivities,
                }
              : prev
          );
        }
        // Re-fetch order so Velocity-synced EDD is current
        try {
          const fresh = await orderService.getOrder(order.id);
          if (fresh?.id) {
            setOrder(toDisplayOrder({ ...fresh, trackingActivities: activities.length ? activities : fresh.trackingActivities }));
          }
        } catch {
          /* keep current */
        }
        if (!opts?.silent) toast.success("Tracking refreshed from Velocity");
      } else {
        const resp = await velocityService.trackShipmentPublic(awb);
        const activities = resp.data?.activities ?? [];
        setLiveActivities(activities);
        if (!opts?.silent) toast.success("Tracking refreshed");
      }
    } catch (err: unknown) {
      if (!opts?.silent) {
        toast.error(err instanceof Error ? err.message : "Could not refresh tracking");
      }
    } finally {
      setTrackingLoading(false);
    }
  };

  // Auto-pull live Velocity tracking + EDD once order with AWB is loaded
  useEffect(() => {
    if (!order?.id) return;
    const awb = String(order.awb || "").trim();
    if (!awb || awb === "—" || awb === "N/A") return;
    void refreshLiveTracking({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when order id / awb identity changes
  }, [order?.id, order?.awb]);

  const handleCancelOrder = async () => {
    if (!orderId || !order) return;
    setActionLoading(true);
    try {
      const awb = String(order.awb || "").trim();
      if (awb && awb !== "—" && awb !== "N/A" && getStoredToken()) {
        // Provider-aware cancel (Velocity / Lorrigo) + local Reship
        await orderService.moveOrderToReship(order.id);
        setOrder((prev) =>
          prev ? { ...prev, status: "reship" as Order["status"], shipmentStatus: "reship", awb: "" } : prev
        );
        notifyOrdersListRefresh(order.id, "reship");
        toast.success("Shipment cancelled — order moved to Reship.");
      } else if (getStoredToken()) {
        await orderService.updateOrderStatus(order.id, "cancelled");
        setOrder((prev) =>
          prev ? { ...prev, status: "cancelled" as Order["status"], shipmentStatus: "cancelled" } : prev
        );
        notifyOrdersListRefresh(order.id, "cancelled");
        toast.success("Order cancelled successfully.");
      } else {
        throw new Error("Sign in to cancel this order");
      }
      setCancelOpen(false);
      if (window.opener) {
        window.close();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRaiseNDR = async () => {
    if (!orderId || !ndrReason || !order) return;
    if (!getStoredToken()) {
      toast.error("Sign in to raise NDR");
      return;
    }
    setActionLoading(true);
    try {
      await orderService.updateOrderStatus(order.id, "ndr");
      setOrder((prev) => (prev ? { ...prev, status: "ndr" as Order["status"], shipmentStatus: "ndr" } : prev));
      notifyOrdersListRefresh(order.id, "ndr");
      setNdrOpen(false);
      setNdrReason("");
      toast.success(`NDR raised (${ndrReason}).`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to raise NDR");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!orderId || !newStatus || !order) return;
    if (!getStoredToken()) {
      toast.error("Sign in to update order status");
      return;
    }
    setActionLoading(true);
    try {
      const updated = await orderService.updateOrderStatus(order.id, newStatus);
      setOrder(toDisplayOrder(updated));
      notifyOrdersListRefresh(order.id, updated.status || newStatus);
      setStatusOpen(false);
      setNewStatus("");
      toast.success(`Status updated to ${formatStatusLabel(updated.status || newStatus)}.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <Package className="h-12 w-12 text-text-muted mx-auto" />
          <p className="text-lg font-semibold text-text-primary">Order not found</p>
          <p className="text-sm text-text-muted">ID: {orderId || "none"}</p>
        </div>
      </div>
    );
  }

  const currentKey = normalizeStatusKey(order.status);
  const nextStatuses = STATUS_OPTIONS.filter((s) => s.value !== currentKey);
  const activities =
    (liveActivities && liveActivities.length > 0
      ? liveActivities
      : order.trackingActivities && order.trackingActivities.length > 0
        ? order.trackingActivities
        : null) ?? null;
  const { steps: milestoneSteps, currentStep } = buildRealMilestoneSteps(order);
  const eddLabel = formatEddDisplay(order.edd);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light">
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-text-primary">Order {order.id}</h1>
          <p className="text-xs text-text-muted">Shipment Details</p>
        </div>
        <span
          className={cn(
            "ml-auto rounded-full px-3 py-1 text-xs font-semibold capitalize",
            statusColors[currentKey] || statusColors[order.status] || "bg-surface-2 text-text-muted"
          )}
        >
          {formatStatusLabel(order.shipmentStatus || order.status)}
        </span>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-card border border-border p-5 space-y-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Customer Details
            </h2>
            <div className="space-y-2 text-sm">
              <p className="text-text-primary font-medium">{order.customer}</p>
              <p className="text-text-muted flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {order.phone}
              </p>
              <p className="text-text-muted flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {order.address}
              </p>
              <p className="text-text-muted">
                {order.city}
                {order.state ? `, ${order.state}` : ""} — {order.pincode}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-card border border-border p-5 space-y-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Truck className="h-4 w-4 text-secondary" /> Shipping Info
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">AWB</span>
                <span className="font-mono text-text-primary font-semibold">{order.awb || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Courier</span>
                <span className="text-text-primary">{order.courierName || order.courier || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted flex items-center gap-1">
                  <Weight className="h-3.5 w-3.5" />
                  Weight
                </span>
                <span className="text-text-primary">{order.weight || "—"}</span>
              </div>
              {order.dimensions ? (
                <div className="flex justify-between">
                  <span className="text-text-muted flex items-center gap-1">
                    <Ruler className="h-3.5 w-3.5" />
                    Dimensions
                  </span>
                  <span className="text-text-primary">{order.dimensions}</span>
                </div>
              ) : null}
              {order.zone ? (
                <div className="flex justify-between">
                  <span className="text-text-muted">Zone</span>
                  <span className="text-text-primary">{order.zone}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border p-5 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-accent-foreground" /> Payment
          </h2>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  order.payment === "COD" ? "bg-warning-light text-warning-dark" : "bg-success-light text-success-dark"
                )}
              >
                {order.payment}
              </span>
              <span className="text-text-muted flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {order.date}
              </span>
            </div>
            <span className="text-xl font-bold text-text-primary">₹{Number(order.amount || 0).toLocaleString()}</span>
          </div>
        </div>

        {order.products && order.products.length > 0 && (
          <div className="rounded-xl bg-card border border-border p-5 space-y-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" /> Products
            </h2>
            <div className="divide-y divide-border">
              {order.products.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wide text-text-muted mb-1">Product Name</p>
                    <ProductNameText product={{ name: p.name, productName: p.productName }} />
                    <div className="mt-2">
                      <p className="text-[10px] uppercase tracking-wide text-text-muted mb-1">SKU</p>
                      <SkuBadge product={{ sku: p.sku }} index={i} />
                    </div>
                    <p className="text-xs text-text-muted mt-2">
                      Qty: {p.qty} · {p.weight}
                    </p>
                  </div>
                  <span className="font-medium text-text-primary">{formatProductPriceInr(getFinalLineItemUnitPrice(p))}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl bg-card border border-border p-5 space-y-3">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Quick Actions</h2>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-11 gap-2 text-sm font-medium bg-background text-foreground border-border hover:bg-muted/50"
                onClick={() => {
                  printShippingLabel(order, labelSettings);
                  toast.success("Printing label…");
                }}
              >
                <Printer className="h-4 w-4" /> Print Label
              </Button>
              <Button
                variant="outline"
                className="h-11 gap-2 text-sm font-medium bg-background text-foreground border-border hover:bg-muted/50"
                disabled={pdfLoading !== null}
                onClick={() => {
                  setPdfLoading("label");
                  void downloadShippingLabelPdf(order, labelSettings)
                    .then(() => toast.success("Label opened — use Print / Save as PDF"))
                    .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Download failed"))
                    .finally(() => setPdfLoading(null));
                }}
              >
                {pdfLoading === "label" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Label PDF
              </Button>
              <Button
                variant="outline"
                className="h-11 gap-2 text-sm font-medium bg-background text-foreground border-border hover:bg-muted/50"
                disabled={pdfLoading !== null}
                onClick={() => {
                  setPdfLoading("invoice");
                  void downloadInvoicePdf(order, labelSettings)
                    .then(() => toast.success("Invoice PDF downloaded"))
                    .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Download failed"))
                    .finally(() => setPdfLoading(null));
                }}
              >
                {pdfLoading === "invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Invoice PDF
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-11 gap-2 text-sm font-medium"
                onClick={() => {
                  setNewStatus("");
                  setStatusOpen(true);
                }}
              >
                <RefreshCw className="h-4 w-4" /> Update Status
              </Button>
              <Button
                variant="outline"
                className="h-11 gap-2 text-sm font-medium text-warning-dark"
                onClick={() => {
                  setNdrReason("");
                  setNdrOpen(true);
                }}
              >
                <AlertTriangle className="h-4 w-4" /> Raise NDR
              </Button>
              <Button
                variant="outline"
                className="h-11 gap-2 text-sm font-medium text-destructive border-destructive/30 bg-destructive/5 hover:bg-destructive/10 col-span-2"
                onClick={() => setCancelOpen(true)}
              >
                <XCircle className="h-4 w-4" /> Cancel Order
              </Button>
            </div>
          </div>
        </div>

        <Suspense fallback={<div className="rounded-xl bg-card border border-border p-5 animate-pulse h-32" />}>
          <div className="rounded-xl bg-card border border-border p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" /> Shipment Timeline
              </h2>
              <div className="flex items-center gap-2">
                {eddLabel ? (
                  <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-semibold">
                    EDD: {eddLabel}
                  </span>
                ) : null}
                {String(order.awb || "").trim() && order.awb !== "—" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    disabled={trackingLoading}
                    onClick={() => void refreshLiveTracking()}
                  >
                    {trackingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Refresh
                  </Button>
                ) : null}
              </div>
            </div>

            {eddLabel ? (
              <p className="text-sm text-text-secondary">
                Expected delivery (Velocity): <span className="font-semibold text-text-primary">{eddLabel}</span>
              </p>
            ) : (
              <p className="text-xs text-text-muted">Expected delivery date not available from Velocity yet.</p>
            )}

            {activities && activities.length > 0 ? (
              <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {activities.map((act, i) => (
                  <div key={`${act.date}-${act.activity}-${i}`} className="px-4 py-3 bg-background">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-text-primary font-medium">{act.activity}</p>
                      <span className="text-[11px] text-text-muted whitespace-nowrap font-mono">
                        {formatDisplayDateTime(act.date) || act.date || "—"}
                      </span>
                    </div>
                    {act.location ? <p className="text-xs text-text-muted mt-0.5">{act.location}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <TimelineTracker steps={milestoneSteps} currentStep={currentStep} />
            )}

            {!activities?.length && !(order.statusHistory && order.statusHistory.length) ? (
              <p className="text-xs text-text-muted">No tracking scan history yet for this shipment.</p>
            ) : null}
          </div>
        </Suspense>
      </main>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this order? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={actionLoading}>
              No, Keep It
            </Button>
            <Button variant="destructive" onClick={() => void handleCancelOrder()} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Yes, Cancel Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ndrOpen} onOpenChange={setNdrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise NDR — Select Reason</DialogTitle>
          </DialogHeader>
          <RadioGroup value={ndrReason} onValueChange={setNdrReason} className="space-y-3">
            {NDR_REASONS.map((reason) => (
              <div key={reason} className="flex items-center space-x-3">
                <RadioGroupItem value={reason} id={reason} />
                <Label htmlFor={reason} className="cursor-pointer">
                  {reason}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNdrOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button onClick={() => void handleRaiseNDR()} disabled={!ndrReason || actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit NDR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Order Status</DialogTitle>
            <DialogDescription>
              Current status:{" "}
              <span className="font-medium capitalize">{formatStatusLabel(order.shipmentStatus || order.status)}</span>
              . Changing status moves the order to the matching tab on the orders list.
            </DialogDescription>
          </DialogHeader>
          {nextStatuses.length > 0 ? (
            <RadioGroup value={newStatus} onValueChange={setNewStatus} className="space-y-3">
              {nextStatuses.map((s) => (
                <div key={s.value} className="flex items-center space-x-3">
                  <RadioGroupItem value={s.value} id={s.value} />
                  <Label htmlFor={s.value} className="cursor-pointer capitalize">
                    {s.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          ) : (
            <p className="text-sm text-text-muted">No further status transitions available.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button onClick={() => void handleUpdateStatus()} disabled={!newStatus || actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
