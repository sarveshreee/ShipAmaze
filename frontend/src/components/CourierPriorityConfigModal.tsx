import { useCallback, useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";

import { CourierCard } from "@/components/CourierCard";

import {
  providerDisplayName,
  groupCouriersByProvider,
} from "@/services/courierDiscoveryService";

import { toast } from "sonner";

import { ChevronDown, ChevronUp, GripVertical, Loader2, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";

import {

  getBulkCourierPriority,

  saveBulkCourierPriority,

  type BulkCourierPriorityEntry,

} from "@/services/bulkCourierPriorityService";

import { usePickupAddresses } from "@/hooks/useApiData";

import {

  fetchVelocityLaneCarriers,

  shouldReplaceSavedPrioritiesWithVelocity,

  type VelocityLaneCarrier,

} from "@/lib/velocityLaneCarriers";

import { courierNameMatches } from "@/lib/orderServiceabilityFilter";



const REFERENCE_DEST_PIN = "110001";



type Props = {

  open: boolean;

  onClose: () => void;

  pickupAddressId?: string;

  /** Pickup pincode (6 digits) — preferred over pickupAddressId lookup */

  fromPin?: string;

  destPincode?: string;

  paymentMode?: "cod" | "prepaid";

};



function toPriorityEntries(carriers: VelocityLaneCarrier[]): BulkCourierPriorityEntry[] {

  return carriers.map((c, i) => ({

    courierName: c.carrier_name,

    carrierId: String(c.carrier_id),

    provider:
      c.provider === "lorrigo" ? "lorrigo" : c.provider === "ekart" ? "ekart" : "velocity",

    rank: i + 1,

  }));

}



function resolveDefaultPickupId(

  pickups: { id: string; isDefault?: boolean; velocityWarehouseId?: string; pincode?: string }[]

): string {

  return (

    pickups.find((a) => a.isDefault && a.pincode?.replace(/\D/g, "").length === 6)?.id ||

    pickups.find((a) => a.velocityWarehouseId?.trim() && a.pincode?.replace(/\D/g, "").length === 6)?.id ||

    pickups.find((a) => a.isDefault)?.id ||

    pickups.find((a) => a.pincode?.replace(/\D/g, "").length === 6)?.id ||

    pickups[0]?.id ||

    ""

  );

}



export function CourierPriorityConfigModal({

  open,

  onClose,

  pickupAddressId,

  fromPin: fromPinProp,

  destPincode,

  paymentMode = "prepaid",

}: Props) {

  const { data: platformPickups = [] } = usePickupAddresses({ scope: "platform" });

  const activePickups = useMemo(

    () => platformPickups.filter((a) => a.isActive !== false),

    [platformPickups]

  );



  const [priorities, setPriorities] = useState<BulkCourierPriorityEntry[]>([]);

  const [available, setAvailable] = useState<VelocityLaneCarrier[]>([]);

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [resolvedFromPin, setResolvedFromPin] = useState("");



  const laneToPin = destPincode?.replace(/\D/g, "").slice(0, 6) || REFERENCE_DEST_PIN;



  const resolveFromPin = useCallback((): string => {

    const direct = fromPinProp?.replace(/\D/g, "").slice(0, 6) ?? "";

    if (direct.length === 6) return direct;



    const pickupId = pickupAddressId || resolveDefaultPickupId(activePickups);

    const pickup = activePickups.find((a) => a.id === pickupId);

    return String(pickup?.pincode ?? "").replace(/\D/g, "").slice(0, 6);

  }, [fromPinProp, pickupAddressId, activePickups]);



  const load = useCallback(async () => {

    setLoading(true);

    try {

      const fromPin = resolveFromPin();

      setResolvedFromPin(fromPin);



      const [saved, velocityItems] = await Promise.all([

        getBulkCourierPriority(),

        fromPin.length === 6

          ? fetchVelocityLaneCarriers({ fromPin, toPin: laneToPin, payment_mode: paymentMode })

          : Promise.resolve([] as VelocityLaneCarrier[]),

      ]);



      const savedList = saved.priorities ?? [];

      setAvailable(velocityItems);



      if (shouldReplaceSavedPrioritiesWithVelocity(savedList, velocityItems)) {

        setPriorities(toPriorityEntries(velocityItems));

      } else if (velocityItems.length > 0) {

        const enriched = savedList.map((p) => {

          const match = velocityItems.find(

            (c) =>

              String(c.carrier_id) === String(p.carrierId ?? "") &&

              (c.provider || "velocity") === (p.provider || "velocity")

          );

          if (match?.carrier_name) {
            return {
              ...p,
              courierName: match.carrier_name,
              provider:
                match.provider === "lorrigo"
                  ? "lorrigo"
                  : match.provider === "ekart"
                    ? "ekart"
                    : p.provider || "velocity",
            };
          }

          const byName = velocityItems.find(
            (c) =>
              c.carrier_name.toLowerCase() === p.courierName.toLowerCase() ||
              courierNameMatches(p.courierName, c.carrier_name)
          );

          if (byName) {
            return {
              ...p,
              courierName: byName.carrier_name,
              carrierId: String(byName.carrier_id),
              provider:
                byName.provider === "lorrigo"
                  ? "lorrigo"
                  : byName.provider === "ekart"
                    ? "ekart"
                    : "velocity",
            };
          }

          return p;

        });

        setPriorities(enriched);

      } else {

        setPriorities(savedList);

      }

    } catch (e) {

      toast.error(e instanceof Error ? e.message : "Failed to load courier priority");

    } finally {

      setLoading(false);

    }

  }, [resolveFromPin, laneToPin, paymentMode]);



  useEffect(() => {

    if (open) void load();

  }, [open, load]);



  const priorityIds = useMemo(

    () =>
      new Set(
        priorities.map(
          (p) => `${p.provider || "velocity"}::${p.carrierId || ""}::${p.courierName}`.toLowerCase()
        )
      ),

    [priorities]

  );



  const addable = useMemo(

    () =>

      available.filter(

        (c) =>
          !priorityIds.has(
            `${c.provider || "velocity"}::${c.carrier_id}::${c.carrier_name}`.toLowerCase()
          )

      ),

    [available, priorityIds]

  );



  const move = (idx: number, dir: -1 | 1) => {

    setPriorities((prev) => {

      const next = [...prev];

      const target = idx + dir;

      if (target < 0 || target >= next.length) return prev;

      [next[idx], next[target]] = [next[target], next[idx]];

      return next.map((p, i) => ({ ...p, rank: i + 1 }));

    });

  };



  const remove = (idx: number) => {

    setPriorities((prev) => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, rank: i + 1 })));

  };



  const add = (carrier: VelocityLaneCarrier) => {

    setPriorities((prev) => [

      ...prev,

      {

        courierName: carrier.carrier_name,

        carrierId: carrier.carrier_id,

        provider:
          carrier.provider === "lorrigo"
            ? "lorrigo"
            : carrier.provider === "ekart"
              ? "ekart"
              : "velocity",

        rank: prev.length + 1,

      },

    ]);

  };



  const reloadFromVelocity = () => {

    if (available.length === 0) {

      toast.error("No couriers loaded for this lane. Check pickup pincode and try again.");

      return;

    }

    setPriorities(toPriorityEntries(available));

    toast.success(
      `Loaded ${available.length} courier${available.length === 1 ? "" : "s"} from discovery (Velocity / Lorrigo / Ekart when each returns serviceable)`
    );

  };



  const handleSave = async () => {

    if (priorities.length === 0) {

      toast.error("Add at least one courier to the priority list");

      return;

    }

    setSaving(true);

    try {

      await saveBulkCourierPriority(priorities);

      toast.success("Courier priority saved");

      onClose();

    } catch (e) {

      toast.error(e instanceof Error ? e.message : "Failed to save priority");

    } finally {

      setSaving(false);

    }

  };



  const laneLabel =

    resolvedFromPin.length === 6

      ? `${resolvedFromPin} → ${laneToPin}`

      : "pickup pin required";



  return (

    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>

      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto border-2 border-primary/20 bg-card">

        <DialogHeader>

          <DialogTitle className="text-lg font-bold">Priority Selection</DialogTitle>

          <p className="text-sm text-text-muted">

            Arrange couriers in order of preference. During bulk processing, the system tries Priority #1 first,

            then falls back to the next courier if the lane is not serviceable. Each service (e.g. Ekart Standard vs

            Ekart Standard 3Kg) is listed separately.

          </p>

        </DialogHeader>



        {loading ? (

          <div className="flex items-center justify-center py-12 text-text-muted gap-2">

            <Loader2 className="h-5 w-5 animate-spin" />

            Loading couriers…

          </div>

        ) : (

          <div className="space-y-6">

            <div>

              <div className="flex items-center justify-between gap-2">

                <Label className="text-sm font-semibold text-text-primary">

                  Priority order<span className="text-danger">*</span>

                </Label>

                <Button

                  type="button"

                  variant="outline"

                  size="sm"

                  className="h-8 gap-1.5 text-xs"

                  onClick={reloadFromVelocity}

                  disabled={available.length === 0}

                >

                  <RefreshCw className="h-3.5 w-3.5" />

                  Load all couriers

                </Button>

              </div>

              {priorities.length === 0 ? (

                <p className="text-sm text-text-muted mt-2">No couriers in the list. Add couriers below.</p>

              ) : (

                <ul className="mt-3 space-y-2">

                  {priorities.map((p, idx) => (

                    <li

                      key={`${p.provider || "velocity"}-${p.carrierId}-${p.courierName}-${idx}`}

                      className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2"

                    >

                      <GripVertical className="h-4 w-4 text-text-muted shrink-0" />

                      <span className="text-xs font-bold text-primary w-6">#{idx + 1}</span>

                      <span className="flex-1 text-sm font-medium text-text-primary">
                        {p.courierName}
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-text-muted">
                          {p.provider === "lorrigo"
                            ? "Lorrigo"
                            : p.provider === "ekart"
                              ? "Ekart"
                              : "Velocity"}
                        </span>
                      </span>

                      <div className="flex items-center gap-1">

                        <Button

                          type="button"

                          variant="ghost"

                          size="icon"

                          className="h-8 w-8"

                          disabled={idx === 0}

                          onClick={() => move(idx, -1)}

                        >

                          <ChevronUp className="h-4 w-4" />

                        </Button>

                        <Button

                          type="button"

                          variant="ghost"

                          size="icon"

                          className="h-8 w-8"

                          disabled={idx === priorities.length - 1}

                          onClick={() => move(idx, 1)}

                        >

                          <ChevronDown className="h-4 w-4" />

                        </Button>

                        <Button

                          type="button"

                          variant="ghost"

                          size="icon"

                          className="h-8 w-8 text-destructive hover:text-destructive"

                          onClick={() => remove(idx)}

                        >

                          <Trash2 className="h-4 w-4" />

                        </Button>

                      </div>

                    </li>

                  ))}

                </ul>

              )}

            </div>



            <div>

              <Label className="text-sm font-semibold text-text-primary">Add courier</Label>

              <p className="text-xs text-text-muted mt-1 mb-3">

                Couriers from Velocity, Lorrigo, and Ekart for {laneLabel}

                {!destPincode && resolvedFromPin.length === 6 && " (reference destination — order pincodes may differ)"}.

                {available.length > 0 ? ` ${available.length} service(s) available.` : ""}

              </p>

              {available.length === 0 ? (

                <p className="text-sm text-text-muted">

                  {resolvedFromPin.length !== 6

                    ? "Could not resolve pickup pincode. Select a pickup address with a valid 6-digit pincode, then click Load all couriers."

                    : "No couriers returned for this lane. Try a different destination pincode or payment mode."}

                </p>

              ) : addable.length === 0 ? (

                <p className="text-sm text-text-muted">All available couriers are already in the list.</p>

              ) : (

                <div className="space-y-5">
                  {groupCouriersByProvider(addable).map((section) => (
                    <div key={section.provider}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
                        {providerDisplayName(section.provider)}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {section.items.map((c) => (
                          <div
                            key={`${c.provider || "velocity"}-${c.carrier_id}-${c.carrier_name}`}
                            className="relative"
                          >
                            <CourierCard
                              carrierId={c.carrier_id}
                              carrierName={c.carrier_name}
                              provider={c.provider}
                              compact
                              onClick={() => add(c)}
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="secondary"
                              className="absolute -top-2 -right-2 h-7 w-7 rounded-full shadow-md"
                              onClick={() => add(c)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

              )}

            </div>

          </div>

        )}



        <DialogFooter className="gap-2 sm:gap-2">

          <Button

            onClick={() => void handleSave()}

            disabled={saving || loading || priorities.length === 0}

            className="gap-2 bg-primary text-white"

          >

            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}

            Save

          </Button>

          <Button variant="outline" onClick={onClose} disabled={saving} className="gap-2">

            <X className="h-4 w-4" />

            Close

          </Button>

        </DialogFooter>

      </DialogContent>

    </Dialog>

  );

}


