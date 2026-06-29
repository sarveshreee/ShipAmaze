import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useNdrOrders } from "@/hooks/useApiData";
import { AlertTriangle, Phone, RotateCcw, ArrowRight, Download, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/exportUtils";
import * as ndrService from "@/services/ndrService";
import { syncNdrFromVelocity } from "@/services/velocityService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const reasonColors: Record<string, string> = {
  'Not at Home': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Rejected': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'Wrong Address': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Wrong address': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Fake Attempt': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'Incomplete Address': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'Customer not available': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Customer refused': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'Phone not reachable': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'COD amount issue': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

export default function DropshipperNDR() {
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [autoSynced, setAutoSynced] = useState(false);
  const [actionAwb, setActionAwb] = useState<string | null>(null);
  const tabs = ['all', 'Active', 'Initiated', 'Closed'];
  const { data: ndrOrders = [], isLoading, refetch } = useNdrOrders();
  // Modal states
  const [reAttemptOpen, setReAttemptOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [forceRtoOpen, setForceRtoOpen] = useState(false);
  const [selectedNdr, setSelectedNdr] = useState<any>(null);

  const runSync = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const result = await syncNdrFromVelocity(120);
      if (!silent) {
        toast.success(`Synced ${result.upserted} NDR order(s) from Velocity`);
      }
      await refetch();
    } catch (err: unknown) {
      if (!silent) toast.error(`Sync failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }, [refetch]);

  useEffect(() => {
    if (autoSynced || isLoading) return;
    setAutoSynced(true);
    void runSync(true);
  }, [autoSynced, isLoading, runSync]);

  const filtered = ndrOrders.filter(n => {
    if (tab !== 'all' && n.status !== tab) return false;
    const q = search.trim().toLowerCase();
    if (q.length > 0) {
      return [n.customer, n.phone, n.awb, n.reason, n.seller]
        .some(val => val && String(val).toLowerCase().includes(q));
    }
    return true;
  });

  const handleReAttempt = async () => {
    if (!selectedNdr) return;
    const { awb } = selectedNdr;
    setActionAwb(awb);
    try {
      await ndrService.submitNdrAction(awb, {
        action: "reattempt",
        remarks: "Re-attempt requested from ShipAmaze NDR Management",
      });
      toast.success("Re-attempt submitted to Velocity.");
      setReAttemptOpen(false);
      await refetch();
    } catch (err: unknown) {
      toast.error(`Velocity action failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setActionAwb(null);
    }
  };

  const handleForceRTO = async () => {
    if (!selectedNdr) return;
    const { awb } = selectedNdr;
    setActionAwb(awb);
    try {
      await ndrService.submitNdrAction(awb, {
        action: "rto",
        remarks: "RTO requested from ShipAmaze NDR Management",
      });
      toast.success("RTO request submitted to Velocity.");
      setForceRtoOpen(false);
      await refetch();
    } catch (err: unknown) {
      toast.error(`Velocity action failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setActionAwb(null);
    }
  };

  const handleExport = () => {
    downloadCSV("ndr_export",
      ["AWB", "Customer", "Seller", "Reason", "Attempts", "Status", "Last Update"],
      filtered.map(n => [n.awb, n.customer, n.seller, n.reason, n.attempts, n.status, n.lastUpdate])
    );
    toast.success(`Exported ${filtered.length} NDR records`);
  };

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading NDR data...</div>;

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="NDR Management" breadcrumb={["Dropshipper", "NDR"]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" disabled={syncing} onClick={() => void runSync(false)}>
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Sync"}
            </Button>
            <Button onClick={handleExport} variant="outline" className="gap-2"><Download className="h-4 w-4" />Export CSV</Button>
          </div>
        }
      />
      <div className="rounded-lg bg-warning-light border border-warning/30 p-4 mb-6 flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-warning-dark shrink-0" />
        <div>
          <p className="font-medium text-warning-dark">{ndrOrders.filter(n => n.status === 'Active').length} NDR orders require your action</p>
          <p className="text-sm text-text-secondary">Respond quickly to reduce RTO and improve delivery rates</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 border-b border-border">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-3 py-2 text-sm font-medium border-b-2 -mb-[1px] transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary"
              )}>{t === 'all' ? 'All' : t}
              {t !== 'all' && <span className="ml-1.5 text-xs bg-surface-2 rounded-full px-1.5 py-0.5">{ndrOrders.filter(n => n.status === t).length}</span>}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input placeholder="Search NDR..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56" />
        </div>
      </div>

      {filtered.length === 0 ? (
        search.trim() ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-10 w-10 text-text-muted mb-3" />
            <p className="text-text-primary font-medium">No NDR records found for '{search}'</p>
            <Button variant="link" className="mt-2" onClick={() => setSearch('')}>Clear search</Button>
          </div>
        ) : (
          <EmptyState icon={AlertTriangle} title="No NDR orders" description="No non-delivery reports match the selected filter" actionLabel="Show All" onAction={() => setTab('all')} />
        )
      ) : (
        <div className="space-y-3">
          {filtered.map(n => (
            <div key={n.awb} className="rounded-lg bg-card shadow-card p-4 hover:shadow-card-md transition-shadow">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-primary">{n.awb}</span>
                    {n.carrier ? <span className="text-[10px] text-text-muted">{n.carrier}</span> : null}
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", reasonColors[n.reason] || "bg-surface-2 text-text-secondary")}>{n.reason}</span>
                  </div>
                  <p className="font-medium text-text-primary">{n.customer}</p>
                  <p className="text-sm text-text-muted">{n.phone}</p>
                </div>
                <div className="text-sm">
                  <p className="text-text-muted">Seller: <span className="text-text-secondary">{n.seller}</span></p>
                  <p className="text-text-muted">Attempts: <span className="font-medium text-text-primary">{n.attempts}/3</span></p>
                  <p className="text-text-muted">Last update: {n.lastUpdate}</p>
                  {n.actionMessage ? <p className="mt-1 max-w-[260px] text-xs text-text-secondary">{n.actionMessage}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  {n.status === 'Active' && (
                    <>
                      <Button size="sm" className="text-xs h-8 bg-primary text-primary-foreground gap-1" onClick={() => { setSelectedNdr(n); setReAttemptOpen(true); }}>
                        <ArrowRight className="h-3 w-3" />Re-attempt
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-8 gap-1" onClick={() => { setSelectedNdr(n); setCallOpen(true); }}>
                        <Phone className="h-3 w-3" />Call
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-8 text-danger border-danger/30 hover:bg-danger-light gap-1" onClick={() => { setSelectedNdr(n); setForceRtoOpen(true); }}>
                        <RotateCcw className="h-3 w-3" />Force RTO
                      </Button>
                    </>
                  )}
                  {n.status !== 'Active' && (
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium",
                      n.status === 'Closed' ? 'bg-surface-2 text-text-muted' : 'bg-secondary-light text-secondary-dark'
                    )}>{n.status}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Re-attempt Modal */}
      <Dialog open={reAttemptOpen} onOpenChange={setReAttemptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Re-attempt</DialogTitle>
            <DialogDescription>
              Are you sure you want to schedule another delivery attempt for this order?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReAttemptOpen(false)}>Cancel</Button>
            <Button disabled={actionAwb === selectedNdr?.awb} onClick={handleReAttempt}>
              {actionAwb === selectedNdr?.awb ? "Submitting..." : "Confirm Re-attempt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Call Customer Modal */}
      <Dialog open={callOpen} onOpenChange={setCallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Call Customer</DialogTitle>
            <DialogDescription>
              You are about to call {selectedNdr?.customer} at {selectedNdr?.phone}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCallOpen(false)}>Cancel</Button>
            <Button onClick={() => { window.open(`tel:${selectedNdr?.phone}`, '_self'); setCallOpen(false); }}>Call Now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force RTO Modal */}
      <Dialog open={forceRtoOpen} onOpenChange={setForceRtoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Force RTO</DialogTitle>
            <DialogDescription>
              This will mark the order as Return to Origin. The shipment will be returned to your warehouse. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceRtoOpen(false)}>Cancel</Button>
            <Button disabled={actionAwb === selectedNdr?.awb} variant="destructive" onClick={handleForceRTO}>
              {actionAwb === selectedNdr?.awb ? "Submitting..." : "Force RTO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
