import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

const notifEvents = ["Order Placed", "Shipment Picked Up", "Out for Delivery", "Delivered", "NDR Raised", "RTO Initiated", "COD Credited", "Wallet Low Balance"];
const channels = ["Email", "SMS", "WhatsApp"];

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState("general");

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Settings" breadcrumb={["Admin", "Settings"]} />

      <div className="flex gap-2 mb-6 border-b border-border">
        {["general", "notifications", "api"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn("px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-[1px] transition-colors",
              activeTab === tab ? "border-primary text-primary" : "border-transparent text-text-secondary"
            )}>{tab}</button>
        ))}
      </div>

      {activeTab === "general" && (
        <div className="rounded-lg bg-card shadow-card p-6 max-w-xl space-y-4">
          <div><Label>Company Name</Label><Input defaultValue="ShipFlow Logistics" /></div>
          <div><Label>Contact Email</Label><Input defaultValue="support@shipflow.in" /></div>
          <div><Label>Contact Phone</Label><Input defaultValue="+91 98000 00000" /></div>
          <div><Label>Business Address</Label><Input defaultValue="123, MG Road, Mumbai 400001" /></div>
          <Button className="bg-primary text-primary-foreground hover:bg-primary-dark">Save Changes</Button>
        </div>
      )}

      {activeTab === "notifications" && (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-surface-2/50">
              <th className="p-3 text-left font-medium text-text-secondary">Event</th>
              {channels.map(c => <th key={c} className="p-3 text-center font-medium text-text-secondary">{c}</th>)}
            </tr></thead>
            <tbody>
              {notifEvents.map((ev, i) => (
                <tr key={ev} className={cn("border-b border-border", i % 2 === 0 && "bg-surface-2/30")}>
                  <td className="p-3 text-text-primary">{ev}</td>
                  {channels.map(c => (
                    <td key={c} className="p-3 text-center">
                      <input type="checkbox" defaultChecked={Math.random() > 0.3} className="h-4 w-4 rounded border-border text-primary" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "api" && (
        <div className="rounded-lg bg-card shadow-card p-6 max-w-xl space-y-4">
          <div><Label>API Key</Label><Input readOnly defaultValue="sk_live_xxxxxxxxxxxxxxxxxx" className="font-mono text-xs" /></div>
          <div><Label>Webhook URL</Label><Input defaultValue="https://example.com/webhook" /></div>
          <Button className="bg-primary text-primary-foreground hover:bg-primary-dark">Regenerate API Key</Button>
        </div>
      )}
    </div>
  );
}
