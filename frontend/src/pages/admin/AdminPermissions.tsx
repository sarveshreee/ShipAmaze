import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useAdminTabPermissions, useUserTabPermissions } from "@/hooks/useTabPermissions";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Users, ArrowLeft, Search, RotateCcw } from "lucide-react";
import * as userService from "@/services/userService";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const dropshipperTabs = [
  { key: "home", label: "Home" },
  { key: "catalog", label: "Catalog" },
  { key: "dashboard", label: "Dashboard" },
  { key: "orders", label: "Orders" },
  { key: "create-order", label: "Create Order" },
  { key: "bulk-upload", label: "Bulk Upload" },
  { key: "returns", label: "Returns" },
  { key: "ndr", label: "NDR" },
  { key: "channels", label: "Channels" },
  { key: "wallet", label: "Wallet" },
  { key: "payouts", label: "Payouts" },
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
  { key: "wallet", label: "Wallet" },
  { key: "payouts", label: "Payouts" },
  { key: "settings", label: "Settings" },
];

interface UserInfo {
  user_id: string;
  full_name: string | null;
  business_name: string | null;
  role: string;
}

function UserPermissionsPanel({
  user,
  role,
  defaults,
  onBack,
}: {
  user: UserInfo;
  role: "dropshipper" | "vendor";
  defaults: Record<string, boolean>;
  onBack: () => void;
}) {
  const { userPerms, isLoading, toggleUserPerm, resetUserPerms } = useUserTabPermissions(user.user_id, role);
  const [saving, setSaving] = useState<string | null>(null);
  const tabList = role === "dropshipper" ? dropshipperTabs : vendorTabs;

  const handleToggle = async (tabKey: string, enabled: boolean) => {
    setSaving(tabKey);
    const { error } = await toggleUserPerm(tabKey, enabled);
    if (error) {
      toast.error("Failed to update permission");
    } else {
      toast.success(`${tabKey} ${enabled ? "enabled" : "disabled"} for ${user.full_name || "user"}`);
    }
    setSaving(null);
  };

  const handleReset = async () => {
    await resetUserPerms();
    toast.success("Reset to defaults");
  };

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading user permissions...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h3 className="font-semibold text-text-primary">{user.full_name || "Unnamed User"}</h3>
          <p className="text-xs text-text-muted">{user.business_name || "No business name"} · {role}</p>
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to Defaults
        </Button>
      </div>

      <div className="rounded-lg bg-card shadow-card divide-y divide-border">
        <div className="p-4">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Custom Tab Permissions
          </h3>
          <p className="text-xs text-text-muted mt-1">
            Override default tab visibility for this user. Tabs without a custom override use the role default.
          </p>
        </div>
        {tabList.map(tab => {
          const hasOverride = tab.key in userPerms;
          const effectiveEnabled = hasOverride ? userPerms[tab.key] : defaults[tab.key] !== false;
          return (
            <div key={tab.key} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-primary font-medium">{tab.label}</span>
                {!hasOverride && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-text-muted">default</span>
                )}
                {hasOverride && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">custom</span>
                )}
              </div>
              <Switch
                checked={effectiveEnabled}
                disabled={saving === tab.key}
                onCheckedChange={(v) => handleToggle(tab.key, v)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminPermissions() {
  const { defaults, isLoading, toggleDefault } = useAdminTabPermissions();
  const [saving, setSaving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"dropshipper" | "vendor">("dropshipper");
  const [view, setView] = useState<"defaults" | "users">("defaults");
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);

  // Fetch users for the active role
  useEffect(() => {
    const fetchUsers = async () => {
      setUsersLoading(true);
      try {
        const roleData = await userService.listUsersByRole(activeTab);
        setUsers(
          roleData.map((r) => ({
            user_id: r.user_id,
            full_name: r.full_name,
            business_name: r.business_name,
            role: r.role,
          }))
        );
      } catch {
        setUsers([]);
      } finally {
        setUsersLoading(false);
      }
    };

    if (view === "users") {
      void fetchUsers();
    }
  }, [activeTab, view]);

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

  const filteredUsers = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return [u.full_name, u.business_name, u.user_id].some(
      v => v && v.toLowerCase().includes(q)
    );
  });

  const renderDefaultsTab = (role: "dropshipper" | "vendor", tabList: typeof dropshipperTabs) => (
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

  const renderUsersTab = () => {
    if (selectedUser) {
      return (
        <UserPermissionsPanel
          user={selectedUser}
          role={activeTab}
          defaults={defaults[activeTab] || {}}
          onBack={() => setSelectedUser(null)}
        />
      );
    }

    return (
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input
            placeholder={`Search ${activeTab}s...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {usersLoading ? (
          <div className="animate-pulse p-8 text-text-muted text-center">Loading users...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-lg bg-card shadow-card p-8 text-center text-text-muted">
            {search ? "No users match your search" : `No ${activeTab}s found`}
          </div>
        ) : (
          <div className="rounded-lg bg-card shadow-card divide-y divide-border">
            {filteredUsers.map(user => (
              <button
                key={user.user_id}
                onClick={() => setSelectedUser(user)}
                className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold shrink-0">
                  {(user.full_name || "U").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">{user.full_name || "Unnamed User"}</p>
                  <p className="text-xs text-text-muted truncate">{user.business_name || "No business name"}</p>
                </div>
                <ArrowLeft className="h-4 w-4 text-text-muted rotate-180 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Tab Permissions" breadcrumb={["Admin", "Tab Permissions"]} />
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setSelectedUser(null); setSearch(""); }}>
        <TabsList className="mb-4">
          <TabsTrigger value="dropshipper">Dropshipper</TabsTrigger>
          <TabsTrigger value="vendor">Vendor</TabsTrigger>
        </TabsList>

        <div className="flex gap-2 mb-4">
          <Button
            variant={view === "defaults" ? "default" : "outline"}
            size="sm"
            onClick={() => { setView("defaults"); setSelectedUser(null); }}
            className="gap-1.5"
          >
            <Shield className="h-3.5 w-3.5" />
            Default Permissions
          </Button>
          <Button
            variant={view === "users" ? "default" : "outline"}
            size="sm"
            onClick={() => { setView("users"); setSelectedUser(null); }}
            className="gap-1.5"
          >
            <Users className="h-3.5 w-3.5" />
            Per-User Overrides
          </Button>
        </div>

        <TabsContent value="dropshipper">
          {view === "defaults" ? renderDefaultsTab("dropshipper", dropshipperTabs) : renderUsersTab()}
        </TabsContent>
        <TabsContent value="vendor">
          {view === "defaults" ? renderDefaultsTab("vendor", vendorTabs) : renderUsersTab()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
