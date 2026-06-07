import { useSearchParams, useNavigate } from "react-router-dom";
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
  "in-transit": "bg-primary-light text-primary-dark",
  "out-for-delivery": "bg-secondary-light text-secondary-dark",
  ndr: "bg-warning-light text-warning-dark",
  rto: "bg-danger-light text-danger-dark",
  pending: "bg-surface-2 text-text-muted",
  "ready-to-ship": "bg-accent text-accent-foreground",
  "not-picked": "bg-warning-light text-warning-dark",
  cancelled: "bg-surface-2 text-text-muted",
  draft: "bg-surface-2 text-text-muted",
};

const STATUS_FLOW = ["ready-to-ship", "not-picked", "in-transit", "out-for-delivery", "delivered", "rto"];

const NDR_REASONS = [
  "Customer not available",
  "Wrong address",
  "Customer refused",
  "Phone not reachable",
  "COD amount issue",
];

function getNextStatuses(current: string): { value: string; label: string }[] {
  const idx = STATUS_FLOW.indexOf(current);
  if (idx === -1) {
    // For statuses not in flow, show all
    return STATUS_FLOW.map(s => ({ value: s, label: s.replace(/-/g, " ") }));
  }
  return STATUS_FLOW.slice(idx + 1).map(s => ({ value: s, label: s.replace(/-/g, " ") }));
}

function updateLocalStorageOrder(orderId: string, updates: Record<string, any>) {
  const orders = getStoredOrders();
  const idx = orders.findIndex((o: any) => getOrderRecordId(o) === orderId);
  if (idx !== -1) {
    orders[idx] = { ...orders[idx], ...updates };
    localStorage.setItem("shipflow_orders", JSON.stringify(orders));
  }
}

function removeLocalStorageOrder(orderId: string) {
  const orders = getStoredOrders().filter((o: any) => getOrderRecordId(o) !== orderId);
  localStorage.setItem("shipflow_orders", JSON.stringify(orders));
}

function getStoredOrders(): any[] {
  try {
    const stored = localStorage.getItem("shipflow_orders");
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getOrderRecordId(order: any): string | null {
  if (!order) return null;
  return order.id ?? order.orderId ?? order.order_id ?? order.shipment?.orderId ?? order.data?.shipment?.orderId ?? null;
}

function normalizeOrderRecord(order: any) {
  const shipment = order?.shipment ?? order?.data?.shipment ?? {};
  const consignee = order?.consignee ?? order?.data?.consignee ?? {};
  const packageDetails = order?.pkg ?? order?.data?.pkg ?? {};
  const rawAmount = order?.amount ?? shipment?.invoiceValue ?? 0;
  const amount = Number(rawAmount);
  const dimensions = order?.dimensions ?? (
    packageDetails.length || packageDetails.width || packageDetails.height
      ? `${packageDetails.length || 0}x${packageDetails.width || 0}x${packageDetails.height || 0} cm`
      : ""
  );

  return {
    ...order,
    id: getOrderRecordId(order) ?? "N/A",
    customer: order.customer ?? order.consigneeName ?? consignee.fullName ?? "N/A",
    phone: order.phone ?? consignee.phone ?? "N/A",
    address: order.address ?? shipment.address ?? order.data?.address ?? "N/A",
    city: order.city ?? order.data?.city ?? "N/A",
    pincode: order.pincode ?? order.data?.pincode ?? "N/A",
    weight: order.weight ?? (packageDetails.weight ? `${packageDetails.weight} kg` : "N/A"),
    courier: order.courier ?? shipment.courier ?? "N/A",
    payment: order.payment ?? shipment.paymentType ?? "Prepaid",
    status: order.status ?? shipment.status ?? "pending",
    date: order.date ?? order.dateSaved ?? shipment.date ?? "N/A",
    awb: order.awb ?? shipment.awb ?? "N/A",
    amount: Number.isNaN(amount) ? 0 : amount,
    dimensions,
    zone: order.zone ?? "",
    products: Array.isArray(order.products) ? order.products : Array.isArray(order.data?.products) ? order.data.products : [],
  };
}

export default function PublicOrderDetail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orderId = params.get("id");
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [labelSettings, setLabelSettings] = useState<LabelInvoiceSettings>(DEFAULT_LABEL_INVOICE_SETTINGS);
  const [pdfLoading, setPdfLoading] = useState<null | "label" | "invoice">(null);

  // Modal states
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
    if (!orderId) { setLoading(false); return; }

    const fetchOrder = async () => {
      try {
        const localMatch = getStoredOrders().find((o: any) => getOrderRecordId(o) === orderId);
        if (localMatch) {
          setOrder(normalizeOrderRecord(localMatch));
          return;
        }

        try {
          const data = await orderService.getPublicOrder(orderId);
          if (data?.id) {
            const location = [data.city, data.state].filter(Boolean).join(", ") || "—";
            setOrder(
              normalizeOrderRecord({
                id: data.id ?? orderId,
                customer: "Recipient",
                phone: data.customerPhoneMasked || "—",
                address: location,
                city: data.city || "—",
                pincode: data.pincodeMasked || "—",
                weight: "—",
                courier: data.courier || data.courierName || "—",
                payment: data.payment ?? "—",
                status: data.status,
                date: data.date,
                awb: data.awb || "N/A",
                products: [],
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
              normalizeOrderRecord({
                id: data.id,
                customer: "Recipient",
                phone: data.customerPhoneMasked || "—",
                address: location,
                city: data.city || "—",
                pincode: data.pincodeMasked || "—",
                weight: "—",
                courier: data.courier || data.courierName || "—",
                payment: data.payment ?? "—",
                status: data.status,
                date: data.date,
                awb: data.awb,
                products: [],
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
    fetchOrder();
  }, [orderId]);

  const handleCancelOrder = () => {
    if (!orderId) return;
    removeLocalStorageOrder(orderId);
    setCancelOpen(false);
    toast.success("Order cancelled successfully.");
    // We're on /order-detail (public route, possibly new tab) — go back or close
    if (window.opener) {
      window.close();
    } else {
      // Use window.location to avoid React Router auth guard issues
      window.location.href = "/dropshipper/orders";
    }
  };

  const handleRaiseNDR = () => {
    if (!orderId || !ndrReason || !order) return;
    updateLocalStorageOrder(orderId, { status: "ndr" });
    // Create NDR entry in localStorage
    const today = new Date().toISOString().split("T")[0];
    const ndrEntry = {
      awb: order.awb && order.awb !== "N/A" ? order.awb : `AWB${orderId}`,
      customer: order.customer || "",
      seller: "Seller User",
      reason: ndrReason,
      attempts: 1,
      lastUpdate: today,
      status: "Active",
      phone: order.phone || "",
      nextAction: "Re-attempt",
    };
    const storedNdr = localStorage.getItem("shipflow_ndr");
    const ndrList: any[] = storedNdr ? JSON.parse(storedNdr) : [];
    ndrList.unshift(ndrEntry);
    localStorage.setItem("shipflow_ndr", JSON.stringify(ndrList));
    setOrder((prev: any) => prev ? { ...prev, status: "ndr" } : prev);
    setNdrOpen(false);
    setNdrReason("");
    toast.success("NDR raised successfully.");
  };

  const handleUpdateStatus = () => {
    if (!orderId || !newStatus) return;
    updateLocalStorageOrder(orderId, { status: newStatus });
    setOrder((prev: any) => prev ? { ...prev, status: newStatus } : prev);
    setStatusOpen(false);
    setNewStatus("");
    toast.success(`Status updated to ${newStatus.replace(/-/g, " ")}.`);
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

  const nextStatuses = getNextStatuses(order.status);

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
        <span className={cn("ml-auto rounded-full px-3 py-1 text-xs font-semibold capitalize", statusColors[order.status] || "bg-surface-2 text-text-muted")}>
          {order.status?.replace(/-/g, " ")}
        </span>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Customer & Shipping */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-card border border-border p-5 space-y-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Customer Details
            </h2>
            <div className="space-y-2 text-sm">
              <p className="text-text-primary font-medium">{order.customer}</p>
              <p className="text-text-muted flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{order.phone}</p>
              <p className="text-text-muted flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{order.address}</p>
              <p className="text-text-muted">{order.city} — {order.pincode}</p>
            </div>
          </div>
          <div className="rounded-xl bg-card border border-border p-5 space-y-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Truck className="h-4 w-4 text-secondary" /> Shipping Info
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-text-muted">AWB</span><span className="font-mono text-text-primary">{order.awb}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Courier</span><span className="text-text-primary">{order.courier}</span></div>
              <div className="flex justify-between"><span className="text-text-muted flex items-center gap-1"><Weight className="h-3.5 w-3.5" />Weight</span><span className="text-text-primary">{order.weight}</span></div>
              {order.dimensions && <div className="flex justify-between"><span className="text-text-muted flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />Dimensions</span><span className="text-text-primary">{order.dimensions}</span></div>}
              {order.zone && <div className="flex justify-between"><span className="text-text-muted">Zone</span><span className="text-text-primary">{order.zone}</span></div>}
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className="rounded-xl bg-card border border-border p-5 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-accent-foreground" /> Payment
          </h2>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", order.payment === "COD" ? "bg-warning-light text-warning-dark" : "bg-success-light text-success-dark")}>{order.payment}</span>
              <span className="text-text-muted flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{order.date}</span>
            </div>
            <span className="text-xl font-bold text-text-primary">₹{Number(order.amount).toLocaleString()}</span>
          </div>
        </div>

        {/* Products */}
        {order.products && order.products.length > 0 && (
          <div className="rounded-xl bg-card border border-border p-5 space-y-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" /> Products
            </h2>
            <div className="divide-y divide-border">
              {(Array.isArray(order.products) ? order.products : []).map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wide text-text-muted mb-1">Product Name</p>
                    <ProductNameText product={{ name: p.name, productName: p.productName }} />
                    <div className="mt-2">
                      <p className="text-[10px] uppercase tracking-wide text-text-muted mb-1">SKU</p>
                      <SkuBadge product={{ sku: p.sku }} index={i} />
                    </div>
                    <p className="text-xs text-text-muted mt-2">Qty: {p.qty} · {p.weight}</p>
                  </div>
                  <span className="font-medium text-text-primary">{formatProductPriceInr(getFinalLineItemUnitPrice(p))}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
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
                    .then(() => toast.success("Label PDF downloaded"))
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
              <Button variant="outline" className="h-11 gap-2 text-sm font-medium" onClick={() => { setNewStatus(""); setStatusOpen(true); }}>
                <RefreshCw className="h-4 w-4" /> Update Status
              </Button>
              <Button variant="outline" className="h-11 gap-2 text-sm font-medium text-warning-dark" onClick={() => { setNdrReason(""); setNdrOpen(true); }}>
                <AlertTriangle className="h-4 w-4" /> Raise NDR
              </Button>
              <Button variant="outline" className="h-11 gap-2 text-sm font-medium text-destructive border-destructive/30 bg-destructive/5 hover:bg-destructive/10 col-span-2" onClick={() => setCancelOpen(true)}>
                <XCircle className="h-4 w-4" /> Cancel Order
              </Button>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <Suspense fallback={<div className="rounded-xl bg-card border border-border p-5 animate-pulse h-32" />}>
          <div className="rounded-xl bg-card border border-border p-5">
            <TimelineTracker
              steps={[
                { label: "Order Placed", detail: order.date },
                { label: "Ready to Ship" },
                { label: "Picked Up" },
                { label: "In Transit" },
                { label: "Out for Delivery" },
                { label: "Delivered" },
              ]}
              currentStep={
                order.status === "delivered" ? 5
                  : order.status === "out-for-delivery" ? 4
                  : order.status === "in-transit" ? 3
                  : order.status === "not-picked" ? 2
                  : order.status === "ready-to-ship" ? 1
                  : 0
              }
            />
          </div>
        </Suspense>
      </main>

      {/* Cancel Order Modal */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this order? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>No, Keep It</Button>
            <Button variant="destructive" onClick={handleCancelOrder}>Yes, Cancel Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Raise NDR Modal */}
      <Dialog open={ndrOpen} onOpenChange={setNdrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise NDR — Select Reason</DialogTitle>
          </DialogHeader>
          <RadioGroup value={ndrReason} onValueChange={setNdrReason} className="space-y-3">
            {NDR_REASONS.map(reason => (
              <div key={reason} className="flex items-center space-x-3">
                <RadioGroupItem value={reason} id={reason} />
                <Label htmlFor={reason} className="cursor-pointer">{reason}</Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNdrOpen(false)}>Cancel</Button>
            <Button onClick={handleRaiseNDR} disabled={!ndrReason}>Submit NDR</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Status Modal */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Order Status</DialogTitle>
            <DialogDescription>
              Current status: <span className="font-medium capitalize">{order.status?.replace(/-/g, " ")}</span>
            </DialogDescription>
          </DialogHeader>
          {nextStatuses.length > 0 ? (
            <RadioGroup value={newStatus} onValueChange={setNewStatus} className="space-y-3">
              {nextStatuses.map(s => (
                <div key={s.value} className="flex items-center space-x-3">
                  <RadioGroupItem value={s.value} id={s.value} />
                  <Label htmlFor={s.value} className="cursor-pointer capitalize">{s.label}</Label>
                </div>
              ))}
            </RadioGroup>
          ) : (
            <p className="text-sm text-text-muted">No further status transitions available.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateStatus} disabled={!newStatus}>Update Status</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
