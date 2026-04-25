import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ShoppingBag, Link2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Channel {
  name: string;
  connected: boolean;
  lastSync: string;
  autoImport: boolean;
  syncFulfillment: boolean;
  importFrequency: string;
}

const initialChannels: Channel[] = [
  { name: "Shopify", connected: true, lastSync: "2 min ago", autoImport: true, syncFulfillment: true, importFrequency: "15min" },
  { name: "WooCommerce", connected: true, lastSync: "15 min ago", autoImport: true, syncFulfillment: false, importFrequency: "1hr" },
  { name: "Wix", connected: false, lastSync: "", autoImport: false, syncFulfillment: false, importFrequency: "1hr" },
  { name: "Magento", connected: false, lastSync: "", autoImport: false, syncFulfillment: false, importFrequency: "6hr" },
  { name: "Custom API", connected: false, lastSync: "", autoImport: false, syncFulfillment: false, importFrequency: "1hr" },
];

const frequencyOptions = [
  { value: "15min", label: "Every 15 min" },
  { value: "1hr", label: "Every hour" },
  { value: "6hr", label: "Every 6 hours" },
];

export default function ChannelConnect() {
  const [channels, setChannels] = useState<Channel[]>(initialChannels);

  const updateChannel = (idx: number, field: keyof Channel, value: any) => {
    setChannels(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Channel Connect" breadcrumb={["Dropshipper", "Channels"]} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {channels.map((c, idx) => (
          <div key={c.name} className="rounded-lg bg-card shadow-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light"><ShoppingBag className="h-5 w-5 text-primary" /></div>
              <div className="flex-1">
                <h3 className="font-semibold text-text-primary">{c.name}</h3>
                {c.lastSync && <p className="text-xs text-text-muted">Last sync: {c.lastSync}</p>}
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", c.connected ? "bg-success-light text-success-dark" : "bg-surface-2 text-text-muted")}>
                {c.connected ? "Connected" : "Not Connected"}
              </span>
            </div>

            <Button
              variant={c.connected ? "outline" : "default"}
              className={cn("w-full", !c.connected && "bg-primary text-primary-foreground hover:bg-primary-dark")}
              onClick={() => {
                updateChannel(idx, "connected", !c.connected);
                toast.success(c.connected ? `${c.name} disconnected` : `${c.name} connected`);
              }}
            >
              <Link2 className="h-4 w-4 mr-2" />{c.connected ? "Disconnect" : "Connect"}
            </Button>

            {/* Sync Settings — only for connected channels */}
            {c.connected && (
              <div className="mt-4 pt-4 border-t border-border space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3" /> Sync Settings
                </p>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-text-primary">Auto-import new orders</p>
                    <p className="text-[11px] text-text-muted">Automatically import new orders</p>
                  </div>
                  <Switch
                    checked={c.autoImport}
                    onCheckedChange={(v) => {
                      updateChannel(idx, "autoImport", v);
                      toast.success(`Auto-import ${v ? "enabled" : "disabled"} for ${c.name}`);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-text-primary">Sync fulfillment status</p>
                    <p className="text-[11px] text-text-muted">Push tracking updates back</p>
                  </div>
                  <Switch
                    checked={c.syncFulfillment}
                    onCheckedChange={(v) => {
                      updateChannel(idx, "syncFulfillment", v);
                      toast.success(`Fulfillment sync ${v ? "enabled" : "disabled"} for ${c.name}`);
                    }}
                  />
                </div>

                <div>
                  <p className="text-sm text-text-primary mb-1">Import frequency</p>
                  <select
                    value={c.importFrequency}
                    onChange={e => {
                      updateChannel(idx, "importFrequency", e.target.value);
                      toast.success(`Import frequency updated for ${c.name}`);
                    }}
                    className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs text-text-primary"
                  >
                    {frequencyOptions.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
