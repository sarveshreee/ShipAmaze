import { useState } from "react";
import { Package, Search, Loader2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { useBranding } from "@/contexts/BrandingContext";
import { trackShipmentPublic } from "@/services/velocityService";
import type { VelocityTrackingResult } from "@/services/velocityService";

export default function PublicTracking() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VelocityTrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { branding } = useBranding();

  const btnRadius = branding.buttonStyle === 'pill' ? '9999px' : branding.buttonStyle === 'square' ? '0px' : '8px';

  const handleTrack = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await trackShipmentPublic(trimmed);
      setResult(resp.data);
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
            <h1 className="text-2xl font-bold text-center mb-1" style={{ color: '#1a1a2e' }}>{branding.headerText}</h1>
            <p className="text-sm text-center mb-6" style={{ color: '#6b7280' }}>{branding.subText}</p>

            <div className="flex gap-2">
              <Input
                placeholder="Enter AWB or Order ID"
                value={query}
                onChange={e => setQuery(e.target.value)}
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

            {/* Error state */}
            {error && (
              <div className="mt-6 rounded-lg bg-red-50 border border-red-200 p-4 flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="mt-8 animate-fade-in-up">
                <div className="text-center mb-5">
                  <StatusBadge status={result.status} className="text-base px-4 py-1" />
                </div>

                <div className="flex items-center justify-between text-xs mb-4 pb-4 border-b" style={{ color: '#9ca3af', borderColor: '#e5e7eb' }}>
                  {result.carrierName && <span>{result.carrierName}</span>}
                  <span>AWB: {result.awb}</span>
                  {result.order?.id && <span>Order: {result.order.id}</span>}
                </div>

                {/* Tracking activities */}
                {result.activities.length > 0 ? (
                  <div className="space-y-0 divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                    {result.activities.map((act, i) => (
                      <div key={i} className="px-4 py-3 bg-white">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-gray-900">{act.activity}</p>
                          <span className="text-[11px] text-gray-400 whitespace-nowrap">{act.date}</span>
                        </div>
                        {act.location && (
                          <p className="text-xs text-gray-500 mt-0.5">{act.location}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm text-gray-400 py-6">No tracking events yet</p>
                )}
              </div>
            )}
          </div>

          {branding.showBranding && (
            <p className="text-center text-xs mt-6" style={{ color: '#9ca3af' }}>{branding.footerText}</p>
          )}
        </div>
      </main>
    </div>
  );
}
