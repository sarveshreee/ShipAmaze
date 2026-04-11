import { useState } from "react";
import { Package, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TimelineTracker } from "@/components/TimelineTracker";
import { StatusBadge } from "@/components/StatusBadge";
import { useBranding } from "@/contexts/BrandingContext";
import { cn } from "@/lib/utils";

export default function PublicTracking() {
  const [awb, setAwb] = useState("");
  const [tracked, setTracked] = useState(false);
  const { branding } = useBranding();

  const btnRadius = branding.buttonStyle === 'pill' ? '9999px' : branding.buttonStyle === 'square' ? '0px' : '8px';

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
              <Input placeholder="Enter AWB or Order ID" value={awb} onChange={e => setAwb(e.target.value)} className="flex-1" />
              <button onClick={() => setTracked(true)}
                className="px-5 py-2 text-sm font-medium text-white flex items-center gap-2 hover:opacity-90 transition-opacity"
                style={{ backgroundColor: branding.primaryColor, borderRadius: btnRadius }}>
                <Search className="h-4 w-4" />Track
              </button>
            </div>

            {tracked && (
              <div className="mt-8 animate-fade-in-up">
                <div className="text-center mb-6">
                  <StatusBadge status="out-for-delivery" className="text-base px-4 py-1" />
                  <p className="text-sm mt-2" style={{ color: '#6b7280' }}>Expected delivery: Today by 9 PM</p>
                </div>
                <div className="flex items-center justify-between text-xs mb-4 pb-4 border-b" style={{ color: '#9ca3af', borderColor: '#e5e7eb' }}>
                  <span>Blue Dart</span><span>AWB: AWB900000111</span><span>Order: SF10012</span>
                </div>
                <TimelineTracker currentStep={3} steps={[
                  { label: "Order Placed", timestamp: "Apr 5, 10:00 AM", detail: "Order confirmed" },
                  { label: "Picked Up", timestamp: "Apr 6, 2:30 PM", detail: "Picked from Mumbai Hub" },
                  { label: "In Transit", timestamp: "Apr 7, 8:00 AM", detail: "Reached Delhi Hub" },
                  { label: "Out for Delivery", timestamp: "Apr 8, 9:15 AM", detail: "With delivery agent" },
                  { label: "Delivered", detail: "Pending" },
                ]} />
                <div className="mt-4 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm" style={{ backgroundColor: branding.bgColor }}>
                  <div><span style={{ color: '#6b7280' }}>From:</span> <span className="font-medium" style={{ color: '#1a1a2e' }}>Mumbai</span></div>
                  <div><span style={{ color: '#6b7280' }}>To:</span> <span className="font-medium" style={{ color: '#1a1a2e' }}>Delhi</span></div>
                  <div><span style={{ color: '#6b7280' }}>Weight:</span> <span style={{ color: '#1a1a2e' }}>0.5 kg</span></div>
                  <div><span style={{ color: '#6b7280' }}>Payment:</span> <span style={{ color: '#1a1a2e' }}>Prepaid</span></div>
                </div>
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
