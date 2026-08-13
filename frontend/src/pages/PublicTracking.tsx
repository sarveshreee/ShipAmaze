import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  Package,
  Search,
  Loader2,
  AlertCircle,
  ExternalLink,
  Truck,
  CalendarDays,
  Hash,
  CircleDot,
  User,
  Phone,
  MapPin,
  Wallet,
  CreditCard,
  Scale,
  Boxes,
  Clock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { useBranding } from "@/contexts/BrandingContext";
import { trackShipmentPublic } from "@/services/velocityService";
import type { VelocityTrackingResult } from "@/services/velocityService";
import { getPublicOrder } from "@/services/orderService";
import { cn } from "@/lib/utils";
import { formatDdMmYyyyHms } from "@/lib/dateFormat";

const RECENT_KEY = "shipamaze_recent_tracking";

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
  const formatted = formatDdMmYyyyHms(value);
  return formatted || value;
}

function formatCurrencyINR(amount?: number): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "-";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function pushRecent(q: string) {
  try {
    const prev = readRecent().filter((x) => x !== q);
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...prev].slice(0, 5)));
  } catch {
    /* ignore */
  }
}

function TrackingResults({ result }: { result: VelocityTrackingResult }) {
  if (result.pendingShipment) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center text-sm text-amber-900 dark:text-amber-100">
        Shipment has not been created yet. Generate AWB first.
      </div>
    );
  }

  return (
  <>
    {result.trackingUnavailable && (
      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
        {result.trackingMessage ||
          "Live tracking is temporarily unavailable. Showing the last saved status from our records."}
      </div>
    )}

    <div className="rounded-xl border border-border bg-surface-2/50 p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card">
            <Truck className="h-5 w-5 text-text-muted" />
          </div>
          <div>
            <p className="text-xs text-text-muted">Current status</p>
            <StatusBadge status={result.status} className="mt-1 text-sm px-3 py-1" />
          </div>
        </div>
        {result.activities[0]?.date && (
          <div className="text-right">
            <p className="text-[11px] text-text-muted">Last update</p>
            <p className="text-xs font-medium text-text-primary">{formatDateTime(result.activities[0].date)}</p>
          </div>
        )}
      </div>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-4">
      {[
        { label: "AWB Number", value: result.awb || "-", icon: Hash },
        { label: "Order ID", value: result.order?.id || "-", icon: Package },
        { label: "Courier", value: result.carrierName || "-", icon: Truck },
      ].map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-card p-3">
          <p className="text-[11px] text-text-muted flex items-center gap-1">
            <item.icon className="h-3.5 w-3.5" /> {item.label}
          </p>
          <p className="text-sm font-semibold text-text-primary mt-1 break-all">{item.value}</p>
        </div>
      ))}
    </div>

    <div className="rounded-xl border border-border bg-card p-4 mb-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">Order details</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: "Customer", value: result.orderDetails?.customerName, icon: User },
          { label: "Phone", value: result.orderDetails?.phone, icon: Phone },
          { label: "Payment", value: result.orderDetails?.paymentType, icon: CreditCard },
          { label: "Amount", value: formatCurrencyINR(result.orderDetails?.amount), icon: Wallet },
          { label: "Weight", value: result.orderDetails?.shipment?.weight, icon: Scale },
          { label: "Shipment ID", value: result.orderDetails?.shipment?.shipmentId, icon: Boxes },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-surface-2/40 p-3">
            <p className="text-[11px] text-text-muted flex items-center gap-1">
              <item.icon className="h-3.5 w-3.5" /> {item.label}
            </p>
            <p className="text-sm font-semibold text-text-primary mt-1 break-all">{item.value || "-"}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-surface-2/40 p-3 mt-3">
        <p className="text-[11px] text-text-muted flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" /> Delivery address
        </p>
        <p className="text-sm font-semibold text-text-primary mt-1">
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
        className="mb-4 flex items-center justify-center gap-2 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
      >
        Open carrier tracking <ExternalLink className="h-3.5 w-3.5" />
      </a>
    )}

    {result.activities.length > 0 ? (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="h-4 w-4 text-text-muted" />
          <h3 className="text-sm font-semibold text-text-primary">Tracking timeline</h3>
        </div>
        <div className="space-y-4">
          {result.activities.map((act, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center pt-0.5">
                <CircleDot className="h-4 w-4 text-indigo-600 shrink-0 dark:text-indigo-400" />
                {i !== result.activities.length - 1 && (
                  <div className="w-px flex-1 min-h-8 bg-border mt-1" />
                )}
              </div>
              <div className="flex-1 rounded-lg border border-border bg-surface-2/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-text-primary">{act.activity}</p>
                  <span className="text-[11px] text-text-muted whitespace-nowrap">
                    {formatDateTime(act.date)}
                  </span>
                </div>
                {act.location && <p className="text-xs text-text-secondary mt-1">{act.location}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className="rounded-xl border border-dashed border-border bg-surface-2/30 py-8 px-4 text-center">
        <p className="text-sm font-medium text-text-primary">No tracking events yet</p>
        <p className="text-xs text-text-muted mt-1">Updates appear once the courier scans the shipment.</p>
      </div>
    )}
  </>
  );
}

export default function PublicTracking() {
  const location = useLocation();
  const isEmbedded = /^\/(dropshipper|vendor|admin)\//.test(location.pathname);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VelocityTrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const { branding } = useBranding();

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  const btnRadius = branding.buttonStyle === "pill" ? "9999px" : branding.buttonStyle === "square" ? "0px" : "8px";

  const handleTrack = async (searchQuery?: string) => {
    const trimmed = (searchQuery ?? query).trim();
    if (!trimmed) return;
    setQuery(trimmed);
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
        setResult(
          toSafeTrackingResult({
            awb: trimmed,
            status: orderLookup.status,
            carrierName: orderLookup.courierName ?? orderLookup.courier,
            activities: orderLookup.trackingActivities ?? [],
            order: { id: orderLookup.id },
            orderDetails: {
              phone: orderLookup.customerPhoneMasked,
              paymentType: orderLookup.payment,
              destination: {
                city: orderLookup.city,
                state: orderLookup.state,
                pincode: orderLookup.pincodeMasked,
              },
              dates: {
                orderDate: orderLookup.date,
              },
              shipment: {
                channel: orderLookup.channel,
              },
            },
            pendingShipment: orderLookup.pendingShipment ?? true,
          }),
        );
        pushRecent(trimmed);
        setRecent(readRecent());
        return;
      }

      const awbToQuery = orderLookup?.awb?.trim() || trimmed;
      const resp = await trackShipmentPublic(awbToQuery);
      setResult(
        toSafeTrackingResult({
          ...resp.data,
          awb: (resp.data.awb || awbToQuery).trim(),
          carrierName: resp.data.carrierName || orderLookup?.courierName || orderLookup?.courier || "",
        }),
      );
      pushRecent(trimmed);
      setRecent(readRecent());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Shipment not found. Check the AWB or Order ID.");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void handleTrack();
  };

  const searchCard = (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Enter AWB or Order ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          className="flex-1 h-11 bg-background"
          disabled={loading}
        />
        <Button
          onClick={() => void handleTrack()}
          disabled={loading || !query.trim()}
          className="h-11 w-full bg-indigo-600 hover:bg-indigo-700 text-white sm:w-auto sm:shrink-0"
          style={{ borderRadius: isEmbedded ? undefined : btnRadius }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="ml-2">Track</span>
        </Button>
      </div>

      {recent.length > 0 && !result && !error && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-muted flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> Recent:
          </span>
          {recent.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => void handleTrack(r)}
              className="rounded-full border border-border bg-surface-2/50 px-3 py-1 text-xs text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
            >
              {r}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-text-muted">
        Example: paste your AWB number (e.g. AWB1234567) or internal order ID from ShipAmaze.
      </p>
    </div>
  );

  if (isEmbedded) {
    return (
      <div className="animate-fade-in-up mx-auto max-w-3xl space-y-6 overflow-x-hidden min-w-0">
        <PageHeader title="Track Shipment" breadcrumb={["Dropshipper", "Track Shipment"]} />

        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-6 text-white shadow-lg sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Track your shipment</h2>
              <p className="mt-1 text-sm text-indigo-100">
                Real-time status for AWB and order lookups across your couriers.
              </p>
            </div>
          </div>
        </div>

        {searchCard}

        {!result && !error && !loading && (
          <div className="rounded-2xl border border-dashed border-border bg-surface-2/30 p-10 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-text-muted" />
            <p className="font-medium text-text-primary">Enter a tracking number to get started</p>
            <p className="mt-1 text-sm text-text-muted">
              Search by AWB or order ID to view status, timeline, and delivery details.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-text-secondary">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
            Tracking shipment…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger-light/30 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-danger shrink-0" />
              <p className="text-sm text-text-primary">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void handleTrack()}>
              Retry
            </Button>
          </div>
        )}

        {result && !loading && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm animate-fade-in-up">
            <TrackingResults result={result} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary dark:bg-background" style={{ backgroundColor: branding.bgColor }}>
      <header
        className="flex items-center gap-2 px-6 py-4 border-b border-border"
        style={{ backgroundColor: branding.primaryColor }}
      >
        {branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt={branding.brandName}
            className="h-8 w-auto max-w-[140px] object-contain brightness-0 invert"
          />
        ) : (
          <span className="text-lg font-bold text-white">{branding.brandName}</span>
        )}
      </header>

      <main className="flex-1 flex justify-center p-4 sm:p-6 pt-10 pb-12">
        <div className="w-full max-w-[640px] space-y-6">
          <div className="rounded-2xl border border-border bg-card shadow-lg p-6 sm:p-8 animate-fade-in-up">
            <h1 className="text-2xl font-bold text-center text-text-primary mb-1">{branding.headerText}</h1>
            <p className="text-sm text-center text-text-secondary mb-6">{branding.subText}</p>
            {searchCard}
          </div>

          {!result && !error && !loading && (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
              <Truck className="mx-auto mb-3 h-9 w-9 text-text-muted" />
              <p className="text-sm text-text-muted">No search yet — enter an AWB or order ID above.</p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-10 text-text-secondary">
              <Loader2 className="h-5 w-5 animate-spin" />
              Tracking…
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-danger/30 bg-danger-light/30 p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-danger shrink-0" />
                <p className="text-sm text-text-primary">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleTrack()}
                className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400 shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {result && !loading && (
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm animate-fade-in-up">
              <TrackingResults result={result} />
            </div>
          )}

          {branding.showBranding && (
            <p className="text-center text-xs text-text-muted">{branding.footerText}</p>
          )}
        </div>
      </main>
    </div>
  );
}
