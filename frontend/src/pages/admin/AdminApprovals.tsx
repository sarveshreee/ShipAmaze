import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as approvalService from "@/services/approvalService";
import type { ProductPriceApproval, ShippingRateApproval } from "@/services/approvalService";
import { ApiError } from "@/lib/apiClient";

function DiffBadge({ oldVal, newVal }: { oldVal: number; newVal: number }) {
  const diff = newVal - oldVal;
  const up = diff > 0;
  const down = diff < 0;
  return (
    <span className={cn("text-xs font-medium tabular-nums", up && "text-danger", down && "text-success", !up && !down && "text-text-muted")}>
      {approvalService.fmtInr(oldVal)} → {approvalService.fmtInr(newVal)}
      {diff !== 0 && ` (${up ? "+" : ""}${diff.toFixed(0)})`}
    </span>
  );
}

export default function AdminApprovals() {
  const [tab, setTab] = useState<"price" | "shipping">("price");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [priceRows, setPriceRows] = useState<ProductPriceApproval[]>([]);
  const [shipRows, setShipRows] = useState<ShippingRateApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<{ kind: "price" | "shipping"; id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, sr] = await Promise.all([
        approvalService.listProductPriceApprovals(statusFilter === "all" ? undefined : statusFilter),
        approvalService.listShippingRateApprovals(statusFilter === "all" ? undefined : statusFilter),
      ]);
      setPriceRows(Array.isArray(pr) ? pr : []);
      setShipRows(Array.isArray(sr) ? sr : []);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load approvals");
      setPriceRows([]);
      setShipRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredPrice = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return priceRows;
    return priceRows.filter(
      (r) =>
        r.productName.toLowerCase().includes(q) ||
        (r.productSku ?? "").toLowerCase().includes(q) ||
        (r.submittedByName ?? "").toLowerCase().includes(q)
    );
  }, [priceRows, search]);

  const filteredShip = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shipRows;
    return shipRows.filter(
      (r) =>
        (r.courierName ?? "").toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        (r.submittedByName ?? "").toLowerCase().includes(q)
    );
  }, [shipRows, search]);

  const approvePrice = async (id: string) => {
    setActing(id);
    try {
      await approvalService.approveProductPrice(id);
      toast.success("Price change approved and live");
      window.dispatchEvent(new CustomEvent("shipamaze:refetch:notifications"));
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Approve failed");
    } finally {
      setActing(null);
    }
  };

  const approveShip = async (id: string) => {
    setActing(id);
    try {
      await approvalService.approveShippingRate(id);
      toast.success("Shipping rate change approved");
      window.dispatchEvent(new CustomEvent("shipamaze:refetch:notifications"));
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Approve failed");
    } finally {
      setActing(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectId) return;
    setActing(rejectId.id);
    try {
      if (rejectId.kind === "price") {
        await approvalService.rejectProductPrice(rejectId.id, rejectReason || "Rejected by admin");
      } else {
        await approvalService.rejectShippingRate(rejectId.id, rejectReason || "Rejected by admin");
      }
      toast.success("Request rejected");
      setRejectId(null);
      setRejectReason("");
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Reject failed");
    } finally {
      setActing(null);
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: "bg-warning-light/60 text-warning-dark border-warning/40",
      approved: "bg-success-light/60 text-success-dark border-success/40",
      rejected: "bg-danger-light/60 text-danger-dark border-danger/40",
    };
    return <Badge variant="outline" className={cn(map[s] ?? "")}>{s}</Badge>;
  };

  return (
    <div className="animate-fade-in-up space-y-4">
      <PageHeader
        title="Pending Approvals"
        breadcrumb={["Admin", "Approvals"]}
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input placeholder="Search product, SKU, courier…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "price" | "shipping")}>
        <TabsList>
          <TabsTrigger value="price">Product prices ({filteredPrice.length})</TabsTrigger>
          <TabsTrigger value="shipping">Shipping rates ({filteredShip.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="price" className="mt-4">
          {loading ? (
            <div className="flex items-center gap-2 p-8 text-text-muted"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
          ) : filteredPrice.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-text-muted">No product price approval requests</div>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-border bg-surface-2/50">
                    <th className="p-3 text-left">Product</th>
                    <th className="p-3 text-left">Final price</th>
                    <th className="p-3 text-left">Cost / Ship</th>
                    <th className="p-3 text-left">Submitted by</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">When</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPrice.map((r) => {
                    const prevFinal = approvalService.finalPrice(r.previousPrice, r.previousShippingCharge);
                    const nextFinal = approvalService.finalPrice(r.pendingPrice, r.pendingShippingCharge);
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                        <td className="p-3">
                          <p className="font-medium text-text-primary">{r.productName}</p>
                          <p className="text-xs font-mono text-text-muted">{r.productSku || r.productId}</p>
                        </td>
                        <td className="p-3"><DiffBadge oldVal={prevFinal} newVal={nextFinal} /></td>
                        <td className="p-3 text-xs text-text-secondary">
                          Cost: <DiffBadge oldVal={r.previousPrice} newVal={r.pendingPrice} /><br />
                          Ship: <DiffBadge oldVal={r.previousShippingCharge} newVal={r.pendingShippingCharge} />
                        </td>
                        <td className="p-3 text-text-secondary">{r.submittedByName ?? r.submittedByRole ?? "—"}</td>
                        <td className="p-3">{statusBadge(r.status)}</td>
                        <td className="p-3 text-xs text-text-muted">{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</td>
                        <td className="p-3 text-right">
                          {r.status === "pending" && (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" className="h-8 text-success" disabled={acting === r.id} onClick={() => void approvePrice(r.id)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 text-danger" disabled={acting === r.id} onClick={() => setRejectId({ kind: "price", id: r.id })}>
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                              </Button>
                            </div>
                          )}
                          {r.status === "rejected" && r.rejectedReason && (
                            <p className="text-xs text-danger max-w-[140px] ml-auto">{r.rejectedReason}</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="shipping" className="mt-4">
          {loading ? (
            <div className="flex items-center gap-2 p-8 text-text-muted"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
          ) : filteredShip.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-text-muted">No shipping rate approval requests</div>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b border-border bg-surface-2/50">
                    <th className="p-3 text-left">Type</th>
                    <th className="p-3 text-left">Courier / target</th>
                    <th className="p-3 text-left">Rate change</th>
                    <th className="p-3 text-left">Submitted by</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">When</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShip.map((r) => {
                    const oldSurf = Number(r.previousValues?.surfaceRate ?? 0);
                    const newSurf = Number(r.pendingValues?.surfaceRate ?? 0);
                    const oldAir = Number(r.previousValues?.airRate ?? 0);
                    const newAir = Number(r.pendingValues?.airRate ?? 0);
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                        <td className="p-3 capitalize">{r.type.replace("_", " ")}</td>
                        <td className="p-3 font-medium">{r.courierName ?? (r.dropshipperUserId ? `DS ${r.dropshipperUserId.slice(-6)}` : "—")}</td>
                        <td className="p-3 text-xs">
                          {r.type === "courier" ? (
                            <>
                              Surface: <DiffBadge oldVal={oldSurf} newVal={newSurf} /><br />
                              Air: <DiffBadge oldVal={oldAir} newVal={newAir} />
                            </>
                          ) : (
                            <span className="text-text-muted">Rate card / override — review pending values</span>
                          )}
                        </td>
                        <td className="p-3 text-text-secondary">{r.submittedByName ?? r.submittedByRole ?? "—"}</td>
                        <td className="p-3">{statusBadge(r.status)}</td>
                        <td className="p-3 text-xs text-text-muted">{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</td>
                        <td className="p-3 text-right">
                          {r.status === "pending" && (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" className="h-8 text-success" disabled={acting === r.id} onClick={() => void approveShip(r.id)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 text-danger" disabled={acting === r.id} onClick={() => setRejectId({ kind: "shipping", id: r.id })}>
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!rejectId} onOpenChange={(o) => !o && setRejectId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject request</DialogTitle></DialogHeader>
          <Input placeholder="Reason (optional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmReject()}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
