import { useState } from "react";
import { Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimelineTracker } from "@/components/TimelineTracker";
import { StatusBadge } from "@/components/StatusBadge";

export default function PublicTracking() {
  const [awb, setAwb] = useState("");
  const [tracked, setTracked] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center gap-2 px-6 py-4 border-b border-border bg-card">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary"><Package className="h-4 w-4 text-primary-foreground"/></div>
        <span className="text-lg font-bold text-text-primary">ShipFlow</span>
      </header>
      <main className="flex-1 flex items-start justify-center p-6 pt-16">
        <div className="w-full max-w-[600px]">
          <div className="rounded-xl bg-card shadow-card-md p-8 animate-fade-in-up">
            <h1 className="text-2xl font-bold text-text-primary text-center mb-1">Track Your Shipment</h1>
            <p className="text-sm text-text-muted text-center mb-6">Enter your AWB or Order ID below</p>
            <div className="flex gap-2">
              <Input placeholder="Enter AWB or Order ID" value={awb} onChange={e => setAwb(e.target.value)} className="flex-1" />
              <Button onClick={() => setTracked(true)} className="bg-primary text-primary-foreground hover:bg-primary-dark"><Search className="h-4 w-4 mr-2"/>Track</Button>
            </div>

            {tracked && (
              <div className="mt-8 animate-fade-in-up">
                <div className="text-center mb-6">
                  <StatusBadge status="out-for-delivery" className="text-base px-4 py-1" />
                  <p className="text-sm text-text-muted mt-2">Expected delivery: Today by 9 PM</p>
                </div>
                <div className="flex items-center justify-between text-xs text-text-muted mb-4 pb-4 border-b border-border">
                  <span>Blue Dart</span><span>AWB: AWB900000111</span><span>Order: SF10012</span>
                </div>
                <TimelineTracker currentStep={3} steps={[
                  { label: "Order Placed", timestamp: "Apr 5, 10:00 AM", detail: "Order confirmed" },
                  { label: "Picked Up", timestamp: "Apr 6, 2:30 PM", detail: "Picked from Mumbai Hub" },
                  { label: "In Transit", timestamp: "Apr 7, 8:00 AM", detail: "Reached Delhi Hub" },
                  { label: "Out for Delivery", timestamp: "Apr 8, 9:15 AM", detail: "With delivery agent" },
                  { label: "Delivered", detail: "Pending" },
                ]} />
                <div className="mt-4 rounded-lg bg-surface-2 p-4 grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-text-muted">From:</span> <span className="text-text-primary font-medium">Mumbai</span></div>
                  <div><span className="text-text-muted">To:</span> <span className="text-text-primary font-medium">Delhi</span></div>
                  <div><span className="text-text-muted">Weight:</span> <span className="text-text-primary">0.5 kg</span></div>
                  <div><span className="text-text-muted">Payment:</span> <span className="text-text-primary">Prepaid</span></div>
                </div>
              </div>
            )}
          </div>
          <p className="text-center text-xs text-text-muted mt-6">Powered by ShipFlow</p>
        </div>
      </main>
    </div>
  );
}
