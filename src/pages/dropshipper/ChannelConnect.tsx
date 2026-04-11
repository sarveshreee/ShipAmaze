import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

const channels = [
  { name: "Shopify", connected: true, lastSync: "2 min ago" },
  { name: "WooCommerce", connected: true, lastSync: "15 min ago" },
  { name: "Wix", connected: false, lastSync: "" },
  { name: "Magento", connected: false, lastSync: "" },
  { name: "Custom API", connected: false, lastSync: "" },
];

export default function ChannelConnect() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Channel Connect" breadcrumb={["Dropshipper", "Channels"]} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {channels.map(c => (
          <div key={c.name} className="rounded-lg bg-card shadow-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light"><ShoppingBag className="h-5 w-5 text-primary"/></div>
              <div className="flex-1">
                <h3 className="font-semibold text-text-primary">{c.name}</h3>
                {c.lastSync && <p className="text-xs text-text-muted">Last sync: {c.lastSync}</p>}
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", c.connected ? "bg-success-light text-success-dark" : "bg-surface-2 text-text-muted")}>
                {c.connected ? "Connected" : "Not Connected"}
              </span>
            </div>
            <Button variant={c.connected ? "outline" : "default"} className={cn("w-full", !c.connected && "bg-primary text-primary-foreground hover:bg-primary-dark")}>
              <Link2 className="h-4 w-4 mr-2"/>{c.connected ? "Disconnect" : "Connect"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
