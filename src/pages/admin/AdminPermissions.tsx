import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useAdminTabPermissions } from "@/hooks/useTabPermissions";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield } from "lucide-react";

const dropshipperTabs = [
  { key: "dashboard", label: "Dashboard" },
  { key: "orders", label: "Orders" },
  { key: "create-order", label: "Create Order" },
  { key: "bulk-upload", label: "Bulk Upload" },
  { key: "returns", label: "Returns" },
  { key: "ndr", label: "NDR" },
  { key: "channels", label: "Channels" },
  { key: "wallet", label: "Wallet" },
  { key: "rates", label: "Rate Calculator" },
  { key: "weight-disputes", label: "Weight Disputes" },
  { key: "addresses", label: "Pickup Addresses" },
  { key: "tracking", label: "Track Shipment" },
  { key: "settings", label: "Settings" },
];

const vendorTabs = [
  { key: "dashboard", label: "Dashboard" },
  { key: "orders", label: "Orders" },
  { key: "catalogue", label: "Catalogue" },
  { key: "team", label: "Team" },
  { key: "settings", label: "Settings" },
];

export default function AdminPermissions() {
  const { defaults, isLoading, toggleDefault } = useAdminTabPermissions();
  const [saving, setSaving] = useState<string | null>(null);

  const handleToggle = async (role: "dropshipper" | "vendor", tabKey: string, enabled: boolean) => {
    setSaving(`${role}-${tabKey}`);
    const { error } = await toggleDefault(role, tabKey, enabled);
    if (error) {
      toast.error("Failed to update permission");
    } else {
      toast.success(`${tabKey} ${enabled ? "enabled" : "disabled"} for ${role}s`);
    }
    setSaving(null);
  };

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading permissions...</div>;

  const renderTabList = (role: "dropshipper" | "vendor", tabList: typeof dropshipperTabs) => (
    <div className="rounded-lg bg-card shadow-card divide-y divide-border">
      <div className="p-4">
        <h3 className="font-semibold text-text-primary flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Default Tab Visibility for New {role === "dropshipper" ? "Dropshippers" : "Vendors"}
        </h3>
        <p className="text-xs text-text-muted mt-1">Toggle which tabs are visible by default. Changes apply to new users and those without custom overrides.</p>
      </div>
      {tabList.map(tab => {
        const enabled = defaults[role]?.[tab.key] !== false;
        const isSaving = saving === `${role}-${tab.key}`;
        return (
          <div key={tab.key} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-text-primary font-medium">{tab.label}</span>
            <Switch
              checked={enabled}
              disabled={isSaving}
              onCheckedChange={(v) => handleToggle(role, tab.key, v)}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Tab Permissions" breadcrumb={["Admin", "Tab Permissions"]} />
      <Tabs defaultValue="dropshipper">
        <TabsList className="mb-4">
          <TabsTrigger value="dropshipper">Dropshipper Tabs</TabsTrigger>
          <TabsTrigger value="vendor">Vendor Tabs</TabsTrigger>
        </TabsList>
        <TabsContent value="dropshipper">
          {renderTabList("dropshipper", dropshipperTabs)}
        </TabsContent>
        <TabsContent value="vendor">
          {renderTabList("vendor", vendorTabs)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
