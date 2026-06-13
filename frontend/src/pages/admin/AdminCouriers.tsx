import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { useCouriers, usePickupAddresses } from "@/hooks/useApiData";
import { Truck, GripVertical, Plus, X, ArrowRight, Loader2, MapPin, Star, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import * as courierPriorityService from "@/services/courierPriorityService";
import type { CourierPriorityRule, CourierPriorityRuleType } from "@/services/courierPriorityService";
import * as courierService from "@/services/courierService";
import * as pickupService from "@/services/pickupService";
import { ApiError } from "@/lib/apiClient";
import { VelocityWarehouseLinkCard } from "@/components/VelocityWarehouseLinkCard";
import type { PickupAddress } from "@/types/logistics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminCourierRatesPanel } from "@/components/admin/AdminCourierRatesPanel";

const RULE_TYPES: { value: CourierPriorityRuleType; label: string; placeholder: string }[] = [
  { value: "sku", label: "SKU wise", placeholder: "e.g. SKU-ABC-123" },
  { value: "weight", label: "Weight wise", placeholder: "e.g. 0-1, 1-5, >5 (kg)" },
  { value: "productName", label: "Product name wise", placeholder: "e.g. Cotton T-Shirt" },
  { value: "sellerId", label: "Seller ID wise", placeholder: "User / owner id" },
  { value: "vendorId", label: "Vendor ID wise", placeholder: "Vendor document id" },
];

const DRAFT_PREFIX = "draft-";

function isDraftRule(id: string) {
  return id.startsWith(DRAFT_PREFIX);
}

export default function AdminCouriers() {
  const [rules, setRules] = useState<CourierPriorityRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkingCourier, setLinkingCourier] = useState<string | null>(null);
  const { data: courierList = [], isLoading, refetch: refetchCouriers } = useCouriers();
  const {
    data: pickupAddresses = [],
    isLoading: pickupsLoading,
    refetch: refetchPickups,
  } = usePickupAddresses({ scope: "platform" });

  const activePickups = useMemo(
    () => pickupAddresses.filter((p) => p.isActive !== false),
    [pickupAddresses]
  );

  const defaultPickup = useMemo(
    () => pickupAddresses.find((p) => p.isDefault) ?? activePickups[0],
    [pickupAddresses, activePickups]
  );

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const r = await courierPriorityService.listCourierPriorityRules();
      setRules(r.items ?? []);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load priority rules");
      setRules([]);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const addRule = () => {
    const draft: CourierPriorityRule = {
      id: `${DRAFT_PREFIX}${Date.now()}`,
      ruleType: "sku",
      matchValue: "",
      priorities: [{ courierName: courierList[0]?.name ?? "Delhivery", rank: 1 }],
      enabled: true,
      sortOrder: rules.length,
    };
    setRules((prev) => [...prev, draft]);
    toast.info("Fill in the rule details, then click Save rule");
  };

  const saveRule = async (rule: CourierPriorityRule) => {
    if (!rule.matchValue.trim()) {
      toast.error("Match value is required");
      return;
    }
    if (!rule.priorities.length) {
      toast.error("Add at least one courier priority");
      return;
    }
    setSaving(true);
    try {
      if (isDraftRule(rule.id)) {
        const created = await courierPriorityService.createCourierPriorityRule({
          ruleType: rule.ruleType,
          matchValue: rule.matchValue.trim(),
          priorities: rule.priorities,
          enabled: rule.enabled,
          matchValueSecondary: rule.matchValueSecondary,
          note: rule.note,
        });
        setRules((prev) => prev.map((r) => (r.id === rule.id ? created : r)));
        toast.success("Rule created");
      } else {
        const updated = await courierPriorityService.updateCourierPriorityRule(rule.id, rule);
        setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
        toast.success("Rule saved");
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (id: string) => {
    if (isDraftRule(id)) {
      setRules((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    try {
      await courierPriorityService.deleteCourierPriorityRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.success("Rule removed");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  const updateRuleLocal = (id: string, patch: Partial<CourierPriorityRule>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addPriorityRow = (ruleId: string) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.id !== ruleId) return r;
        const nextRank = (r.priorities[r.priorities.length - 1]?.rank ?? 0) + 1;
        return {
          ...r,
          priorities: [
            ...r.priorities,
            { courierName: courierList[0]?.name ?? "", rank: nextRank },
          ],
        };
      })
    );
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const updated = [...rules];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(idx, 0, moved);
    setRules(updated);
    setDragIdx(idx);
  };
  const handleDragEnd = async () => {
    setDragIdx(null);
    const persistedIds = rules.filter((r) => !isDraftRule(r.id)).map((r) => r.id);
    if (persistedIds.length === 0) return;
    try {
      await courierPriorityService.reorderCourierPriorityRules(persistedIds);
    } catch {
      toast.error("Could not save rule order");
      void loadRules();
    }
  };

  const linkCourierPickup = async (courierName: string, pickupId: string) => {
    const courier = courierList.find((c) => c.name === courierName);
    if (!courier) return;
    setLinkingCourier(courierName);
    try {
      await courierService.upsertCourier({
        name: courier.name,
        active: courier.active,
        priority: courier.priority,
        deliveryRate: courier.deliveryRate,
        ndrRate: courier.ndrRate,
        rtoRate: courier.rtoRate,
        avgDeliveryDays: courier.avgDeliveryDays,
        codSupport: courier.codSupport,
        reversePickup: courier.reversePickup,
        surfaceRate: courier.surfaceRate,
        airRate: courier.airRate,
        preferredPickupAddressId: pickupId === "none" ? "" : pickupId,
      });
      await refetchCouriers();
      toast.success(`Pickup linked to ${courierName}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not link pickup");
    } finally {
      setLinkingCourier(null);
    }
  };

  const setDefaultPickup = async (pickup: PickupAddress) => {
    try {
      await pickupService.setDefaultPickupAddress(pickup.id);
      window.dispatchEvent(new Event("shipamaze:refetch:pickup_addresses_platform"));
      await refetchPickups();
      toast.success(`"${pickup.label}" set as default pickup for courier operations`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not set default pickup");
    }
  };

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading couriers...</div>;

  return (
    <div className="animate-fade-in-up space-y-6">
      <PageHeader title="Courier Management" breadcrumb={["Admin", "Couriers"]} />

      <Tabs defaultValue="management" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="management">Management</TabsTrigger>
          <TabsTrigger value="rates">Courier Rates</TabsTrigger>
        </TabsList>

        <TabsContent value="rates" className="mt-0">
          <AdminCourierRatesPanel courierNames={courierList.map((c) => c.name)} />
        </TabsContent>

        <TabsContent value="management" className="mt-0 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {courierList.map((c) => (
          <div key={c.name} className="rounded-lg bg-card shadow-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-text-primary">{c.name}</h3>
                <span className={cn("text-xs font-medium", c.active ? "text-success" : "text-text-muted")}>
                  {c.active ? "Active" : "Inactive"}
                </span>
              </div>
              <span className="rounded-full bg-tertiary-light px-2 py-0.5 text-xs font-medium text-tertiary-dark">
                P{c.priority}
              </span>
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted block mb-1">Pickup location</label>
              <Select
                value={c.preferredPickupAddressId || "none"}
                disabled={linkingCourier === c.name || activePickups.length === 0}
                onValueChange={(v) => void linkCourierPickup(c.name, v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select pickup…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No pickup linked —</SelectItem>
                  {activePickups.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label} · {p.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-card shadow-card p-6">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-text-primary flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Pickup locations
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Loaded from Admin → Pickup Addresses. Link Velocity warehouses and set the default for courier operations.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
            <Link to="/admin/pickup-addresses">
              Manage addresses <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
        </div>

        {pickupsLoading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading pickup addresses…
          </div>
        ) : pickupAddresses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-muted">
            No pickup addresses yet.{" "}
            <Link to="/admin/pickup-addresses" className="text-primary underline underline-offset-2">
              Add one in Pickup Addresses
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {defaultPickup && (
              <p className="text-xs text-text-secondary">
                Default for courier operations:{" "}
                <strong className="text-text-primary">{defaultPickup.label}</strong>
                {defaultPickup.velocityWarehouseId ? (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    Velocity: {defaultPickup.velocityWarehouseId}
                  </Badge>
                ) : null}
              </p>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {pickupAddresses.map((p) => {
                const linkedCouriers = courierList.filter((c) => c.preferredPickupAddressId === p.id);
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "rounded-lg border p-4 space-y-3",
                      p.isDefault ? "border-primary ring-1 ring-primary/20" : "border-border"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary truncate">{p.label}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {p.contactName} · {p.phone}
                        </p>
                        <p className="text-xs text-text-muted mt-1">
                          {[p.addressLine1, p.city, p.state, p.pincode].filter(Boolean).join(", ")}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {p.isDefault ? (
                          <Badge className="text-[10px] gap-1">
                            <Star className="h-2.5 w-2.5" /> Default
                          </Badge>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px]"
                            disabled={p.isActive === false}
                            onClick={() => void setDefaultPickup(p)}
                          >
                            Set default
                          </Button>
                        )}
                        {p.isActive === false ? (
                          <span className="text-[10px] text-text-muted">Inactive</span>
                        ) : null}
                      </div>
                    </div>
                    {linkedCouriers.length > 0 && (
                      <p className="text-xs text-text-secondary">
                        Linked couriers: {linkedCouriers.map((c) => c.name).join(", ")}
                      </p>
                    )}
                    <VelocityWarehouseLinkCard
                      mongoId={p.id}
                      velocityWarehouseId={p.velocityWarehouseId}
                      onUpdated={async () => {
                        window.dispatchEvent(new Event("shipamaze:refetch:pickup_addresses_platform"));
                        await refetchPickups();
                      }}
                      forbiddenHint="pickup"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-card shadow-card p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-semibold text-text-primary">Courier priority rules</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Evaluated top-to-bottom during auto courier assignment. Drag rules to reorder.
            </p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary-dark"
            onClick={addRule}
          >
            <Plus className="h-3.5 w-3.5" /> Add rule
          </Button>
        </div>

        {rulesLoading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading rules…
          </div>
        ) : (
          <div className="space-y-4">
            {rules.map((rule, idx) => {
              const typeMeta = RULE_TYPES.find((t) => t.value === rule.ruleType) ?? RULE_TYPES[0];
              const draft = isDraftRule(rule.id);
              return (
                <div
                  key={rule.id}
                  draggable={!draft}
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={() => void handleDragEnd()}
                  className={cn(
                    "rounded-lg border border-border p-4 space-y-3",
                    dragIdx === idx ? "opacity-60 bg-primary-light/30" : "bg-card",
                    draft ? "border-dashed border-primary/40" : "cursor-grab active:cursor-grabbing"
                  )}
                >
                  {draft && (
                    <p className="text-xs text-primary font-medium">New rule — fill details and save</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <GripVertical className={cn("h-4 w-4 text-text-muted shrink-0", draft && "opacity-30")} />
                    <span className="text-xs font-medium text-text-muted w-6">{idx + 1}.</span>
                    <Select
                      value={rule.ruleType}
                      onValueChange={(v) =>
                        updateRuleLocal(rule.id, { ruleType: v as CourierPriorityRuleType })
                      }
                    >
                      <SelectTrigger className="h-8 w-[160px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RULE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-8 text-xs flex-1 min-w-[140px]"
                      value={rule.matchValue}
                      placeholder={typeMeta.placeholder}
                      onChange={(e) => updateRuleLocal(rule.id, { matchValue: e.target.value })}
                    />
                    <div className="flex items-center gap-2 ml-auto">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(v) => updateRuleLocal(rule.id, { enabled: v === true })}
                      />
                      <span className="text-xs text-text-muted">Enabled</span>
                      <button
                        type="button"
                        onClick={() => void removeRule(rule.id)}
                        className="text-text-muted hover:text-danger p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 pl-8">
                    <p className="text-xs font-medium text-text-muted">Courier priority (1 = first choice)</p>
                    {rule.priorities.map((p, pi) => (
                      <div key={pi} className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs w-5 text-text-muted">{p.rank}.</span>
                        <Select
                          value={p.courierName}
                          onValueChange={(v) => {
                            const priorities = rule.priorities.map((row, j) =>
                              j === pi ? { ...row, courierName: v } : row
                            );
                            updateRuleLocal(rule.id, { priorities });
                          }}
                        >
                          <SelectTrigger className="h-8 w-[160px] text-xs">
                            <SelectValue placeholder="Courier" />
                          </SelectTrigger>
                          <SelectContent>
                            {courierList.map((c) => (
                              <SelectItem key={c.name} value={c.name}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <ArrowRight className="h-3 w-3 text-text-muted hidden sm:block" />
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => addPriorityRow(rule.id)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add courier
                    </Button>
                  </div>

                  <div className="pl-8">
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      disabled={saving}
                      onClick={() => void saveRule(rule)}
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      {draft ? "Create rule" : "Save rule"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {rules.length === 0 && (
              <div className="text-center py-10 text-text-muted text-sm">
                No priority rules yet. Add a rule to configure SKU, weight, product, seller, or vendor based routing.
              </div>
            )}
          </div>
        )}
      </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
