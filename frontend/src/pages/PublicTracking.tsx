import { useState } from "react";
import { Package, Search, Loader2, AlertCircle, ExternalLink, Truck, CalendarDays, Hash, CircleDot, User, Phone, MapPin, Wallet, CreditCard, Scale, Boxes } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { useBranding } from "@/contexts/BrandingContext";
import { trackShipmentPublic } from "@/services/velocityService";
import type { VelocityTrackingResult } from "@/services/velocityService";
import { getPublicOrder } from "@/services/orderService";

function toSafeTrackingResult(input: Partial<VelocityTrackingResult> | null | undefined): VelocityTrackingResult {
  const activities = Array.isArray(input?.activities)
    ? input.activities
        .filter((act) => act != null && typeof act === "object")
        .map((act) => {
          const row = act as unknown as Record<string, unknown>;
          return {
            date: typeof row.date === "string" ? row.date : "",
            activity: typeof row.activity === "string" ? row.activity : "Status updated",
            location: typeof row.location === "string" ? row.location : "",
          };
        })
    : [];

  return {
    awb: typeof input?.awb === "string" ? input.awb : "",
    status: typeof input?.status === "string" ? input.status : "pending",
    carrierName: typeof input?.carrierName === "string" ? input.carrierName : undefined,
    activities,
    order: input?.order && typeof input.order === "object" && typeof input.order.id === "string" ? { id: input.order.id } : undefined,
    orderDetails:
      input?.orderDetails && typeof input.orderDetails === "object"
        ? {
            customerName: typeof input.orderDetails.customerName === "string" ? input.orderDetails.customerName : undefined,
            phone: typeof input.orderDetails.phone === "string" ? input.orderDetails.phone : undefined,
            paymentType: typeof input.orderDetails.paymentType === "string" ? input.orderDetails.paymentType : undefined,
            amount: typeof input.orderDetails.amount === "number" ? input.orderDetails.amount : undefined,
            destination:
              input.orderDetails.destination && typeof input.orderDetails.destination === "object"
                ? {
                    city: typeof input.orderDetails.destination.city === "string" ? input.orderDetails.destination.city : undefined,
                    state: typeof input.orderDetails.destination.state === "string" ? input.orderDetails.destination.state : undefined,
                    pincode: typeof input.orderDetails.destination.pincode === "string" ? input.orderDetails.destination.pincode : undefined,
                    address: typeof input.orderDetails.destination.address === "string" ? input.orderDetails.destination.address : undefined,
                  }
                : undefined,
            dates:
              input.orderDetails.dates && typeof input.orderDetails.dates === "object"
                ? {
                    orderDate: typeof input.orderDetails.dates.orderDate === "string" ? input.orderDetails.dates.orderDate : undefined,
                    assignedAt: typeof input.orderDetails.dates.assignedAt === "string" ? input.orderDetails.dates.assignedAt : undefined,
                    movedToReadyAt: typeof input.orderDetails.dates.movedToReadyAt === "string" ? input.orderDetails.dates.movedToReadyAt : undefined,
                  }
                : undefined,
            shipment:
              input.orderDetails.shipment && typeof input.orderDetails.shipment === "object"
                ? {
                    shipmentId: typeof input.orderDetails.shipment.shipmentId === "string" ? input.orderDetails.shipment.shipmentId : undefined,
                    velocityOrderId: typeof input.orderDetails.shipment.velocityOrderId === "string" ? input.orderDetails.shipment.velocityOrderId : undefined,
                    channel: typeof input.orderDetails.shipment.channel === "string" ? input.orderDetails.shipment.channel : undefined,
                    weight: typeof input.orderDetails.shipment.weight === "string" ? input.orderDetails.shipment.weight : undefined,
                  }
                : undefined,
          }
        : undefined,
    pendingShipment: !!input?.pendingShipment,
    trackUrl: typeof input?.trackUrl === "string" ? input.trackUrl : undefined,
    trackingUnavailable: !!input?.trackingUnavailable,
    trackingMessage: typeof input?.trackingMessage === "string" ? input.trackingMessage : undefined,
  };
}

function formatDateTime(value: string): string {
  if (!value.trim()) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatCurrencyINR(amount?: number): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "-";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export default function PublicTracking() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VelocityTrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { branding } = useBranding();

  const btnRadius = branding.buttonStyle === "pill" ? "9999px" : branding.buttonStyle === "square" ? "0px" : "8px";

  const handleTrack = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let orderLookup: Awaited<ReturnType<typeof getPublicOrder>> | null = null;
      try {
        orderLookup = await getPublicOrder(trimmed);
      } catch {
        orderLookup = null;
      }

      if (orderLookup && !orderLookup.awb) {
        setResult(toSafeTrackingResult({
          awb: trimmed,
          status: orderLookup.status,
          carrierName: orderLookup.courierName ?? orderLookup.courier,
          activities: orderLookup.trackingActivities ?? [],
          order: { id: orderLookup.id },
          orderDetails: {
            customerName: orderLookup.customer,
            phone: orderLookup.customerPhone ?? orderLookup.phone,
            paymentType: orderLookup.payment,
            amount: orderLookup.amount,
            destination: {
              city: orderLookup.shippingCity ?? orderLookup.city,
              state: orderLookup.shippingState ?? orderLookup.state,
              pincode: orderLookup.shippingPincode ?? orderLookup.pincode,
              address: [orderLookup.shippingAddress1, orderLookup.shippingAddress2, orderLookup.address].filter(Boolean).join(", "),
            },
            dates: {
              orderDate: orderLookup.date,
              assignedAt: orderLookup.assignedDateTime,
              movedToReadyAt: orderLookup.movedToReadyAt,
            },
            shipment: {
              shipmentId: orderLookup.shipmentId ?? orderLookup.velocityShipmentId,
              velocityOrderId: orderLookup.velocityOrderId,
              channel: orderLookup.channel,
              weight: orderLookup.weight,
            },
          },
          pendingShipment: true,
        }));
        return;
      }

      const awbToQuery = orderLookup?.awb?.trim() || trimmed;
      const resp = await trackShipmentPublic(awbToQuery);
      setResult(
        toSafeTrackingResult({
          ...resp.data,
          awb: (resp.data.awb || awbToQuery).trim(),
          carrierName: resp.data.carrierName || orderLookup?.courierName || orderLookup?.courier || "",
        })
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Order not found");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void handleTrack();
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: branding.bgColor }}>
      <header className="flex items-center gap-2 px-6 py-4 border-b border-border" style={{ backgroundColor: branding.primaryColor }}>
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt="Logo" className="h-7 w-7 rounded object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
            <Package className="h-4 w-4 text-white" />
          </div>
        )}
        <span className="text-lg font-bold text-white">{branding.brandName}</span>
      </header>

      <main className="flex-1 flex items-start justify-center p-6 pt-16">
        <div className="w-full max-w-[600px]">
          <div className="rounded-xl bg-white shadow-xl p-8 animate-fade-in-up">
            <h1 className="text-2xl font-bold text-center mb-1" style={{ color: "#1a1a2e" }}>
              {branding.headerText}
            </h1>
            <p className="text-sm text-center mb-6" style={{ color: "#6b7280" }}>
              {branding.subText}
            </p>

            <div className="flex gap-2">
              <Input
                placeholder="Enter AWB or Order ID"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                className="flex-1"
                disabled={loading}
              />
              <button
                onClick={() => void handleTrack()}
                disabled={loading || !query.trim()}
                className="px-5 py-2 text-sm font-medium text-white flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
                style={{ backgroundColor: branding.primaryColor, borderRadius: btnRadius }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Track
              </button>
            </div>

            {error && (
              <div className="mt-6 rounded-lg bg-red-50 border border-red-200 p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleTrack()}
                  className="text-sm font-medium text-red-800 underline-offset-2 hover:underline shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            {result && (
              <div className="mt-8 animate-fade-in-up">
                {result.pendingShipment ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 text-center">
                    Shipment has not been created yet. Generate AWB first.
                  </div>
                ) : (
                  <>
                    {result.trackingUnavailable && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 mb-4">
                        {result.trackingMessage ||
                          "Live tracking is temporarily unavailable. Showing the last saved status from our records."}
                      </div>
                    )}
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="h-9 w-9 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                            <Truck className="h-4 w-4 text-gray-500" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Current shipment status</p>
                            <div className="mt-1">
                              <StatusBadge status={result.status} className="text-sm px-3 py-1" />
                            </div>
                          </div>
                        </div>
                        {result.activities[0]?.date && (
                          <div className="text-right">
                            <p className="text-[11px] text-gray-500">Last update</p>
                            <p className="text-xs font-medium text-gray-700">{formatDateTime(result.activities[0].date)}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                      <div className="rounded-lg border border-gray-200 p-3 bg-white">
                        <p className="text-[11px] text-gray-500 flex items-center gap-1">
                          <Hash className="h-3.5 w-3.5" /> AWB Number
                        </p>
                        <p className="text-sm font-semibold text-gray-900 mt-1 break-all">{result.awb || "-"}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 p-3 bg-white">
                        <p className="text-[11px] text-gray-500 flex items-center gap-1">
                          <Package className="h-3.5 w-3.5" /> Order ID
                        </p>
                        <p className="text-sm font-semibold text-gray-900 mt-1">{result.order?.id || "-"}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 p-3 bg-white">
                        <p className="text-[11px] text-gray-500 flex items-center gap-1">
                          <Truck className="h-3.5 w-3.5" /> Courier Partner
                        </p>
                        <p className="text-sm font-semibold text-gray-900 mt-1">{result.carrierName || "-"}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Order Details</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                          <p className="text-[11px] text-gray-500 flex items-center gap-1"><User className="h-3.5 w-3.5" /> Customer</p>
                          <p className="text-sm font-semibold text-gray-900 mt-1">{result.orderDetails?.customerName || "-"}</p>
                        </div>
                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                          <p className="text-[11px] text-gray-500 flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Phone</p>
                          <p className="text-sm font-semibold text-gray-900 mt-1">{result.orderDetails?.phone || "-"}</p>
                        </div>
                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                          <p className="text-[11px] text-gray-500 flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> Payment Type</p>
                          <p className="text-sm font-semibold text-gray-900 mt-1">{result.orderDetails?.paymentType || "-"}</p>
                        </div>
                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                          <p className="text-[11px] text-gray-500 flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Order Amount</p>
                          <p className="text-sm font-semibold text-gray-900 mt-1">{formatCurrencyINR(result.orderDetails?.amount)}</p>
                        </div>
                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                          <p className="text-[11px] text-gray-500 flex items-center gap-1"><Scale className="h-3.5 w-3.5" /> Weight</p>
                          <p className="text-sm font-semibold text-gray-900 mt-1">{result.orderDetails?.shipment?.weight || "-"}</p>
                        </div>
                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                          <p className="text-[11px] text-gray-500 flex items-center gap-1"><Boxes className="h-3.5 w-3.5" /> Shipment ID</p>
                          <p className="text-sm font-semibold text-gray-900 mt-1 break-all">{result.orderDetails?.shipment?.shipmentId || "-"}</p>
                        </div>
                      </div>
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 mt-3">
                        <p className="text-[11px] text-gray-500 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Delivery Address</p>
                        <p className="text-sm font-semibold text-gray-900 mt-1">
                          {[
                            result.orderDetails?.destination?.address,
                            result.orderDetails?.destination?.city,
                            result.orderDetails?.destination?.state,
                            result.orderDetails?.destination?.pincode,
                          ]
                            .filter(Boolean)
                            .join(", ") || "-"}
                        </p>
                      </div>
                    </div>

                    {result.trackUrl && (
                      <a
                        href={result.trackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 text-sm text-primary hover:underline mb-4"
                      >
                        Open carrier tracking <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}

                    {result.activities.length > 0 ? (
                      <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="flex items-center gap-2 mb-4">
                          <CalendarDays className="h-4 w-4 text-gray-500" />
                          <h3 className="text-sm font-semibold text-gray-900">Tracking Timeline</h3>
                        </div>
                        <div className="space-y-4">
                          {result.activities.map((act, i) => (
                            <div key={i} className="flex gap-3">
                              <div className="flex flex-col items-center pt-0.5">
                                <CircleDot className="h-4 w-4 text-primary shrink-0" />
                                {i !== result.activities.length - 1 && <div className="w-px flex-1 min-h-8 bg-gray-200 mt-1" />}
                              </div>
                              <div className="flex-1 rounded-lg border border-gray-100 bg-gray-50 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="text-sm font-medium text-gray-900">{act.activity}</p>
                                  <span className="text-[11px] text-gray-500 whitespace-nowrap">{formatDateTime(act.date)}</span>
                                </div>
                                {act.location && <p className="text-xs text-gray-600 mt-1">{act.location}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      !result.pendingShipment && (
                        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-8 px-4 text-center">
                          <p className="text-sm font-medium text-gray-700">No tracking events yet</p>
                          <p className="text-xs text-gray-500 mt-1">Updates will appear here once the courier scans the shipment.</p>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {branding.showBranding && (
            <p className="text-center text-xs mt-6" style={{ color: "#9ca3af" }}>
              {branding.footerText}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
