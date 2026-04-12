import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useNdrOrders } from "@/hooks/useSupabaseData";
import { AlertTriangle, Phone, RotateCcw, ArrowRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/exportUtils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const reasonColors: Record<string, string> = {
  'Not at Home': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Rejected': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'Wrong Address': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Fake Attempt': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'Incomplete Address': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

export default function DropshipperNDR() {
  const [tab, setTab] = useState('all');
  const tabs = ['all', 'Active', 'Initiated', 'Closed'];
  const { data: ndrOrders = [], isLoading, refetch } = useNdrOrders();
  const { isDemoMode } = useAuth();
  const filtered = tab === 'all' ? ndrOrders : ndrOrders.filter(n => n.status === tab);

  const handleAction = async (awb: string, action: 'Re-attempt' | 'Force RTO') => {
    if (isDemoMode) {
      toast.success(`${action} scheduled for ${awb} (demo mode)`);
      return;
    }
    try {
      const newStatus = action === 'Force RTO' ? 'Closed' : 'Initiated';
      const { error } = await supabase.from('ndr_orders').update({ status: newStatus, next_action: action }).eq('awb', awb);
      if (error) throw error;
      toast.success(`${action} scheduled for ${awb}`);
      refetch();
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
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
        actions={<Button onClick={handleExport} variant="outline" className="gap-2"><Download className="h-4 w-4" />Export CSV</Button>}
      />
      <div className="rounded-lg bg-warning-light border border-warning/30 p-4 mb-6 flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-warning-dark shrink-0" />
        <div>
          <p className="font-medium text-warning-dark">{ndrOrders.filter(n => n.status === 'Active').length} NDR orders require your action</p>
          <p className="text-sm text-text-secondary">Respond quickly to reduce RTO and improve delivery rates</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border mb-4">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-3 py-2 text-sm font-medium border-b-2 -mb-[1px] transition-colors",
              tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary"
            )}>{t === 'all' ? 'All' : t}
            {t !== 'all' && <span className="ml-1.5 text-xs bg-surface-2 rounded-full px-1.5 py-0.5">{ndrOrders.filter(n => n.status === t).length}</span>}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No NDR orders" description="No non-delivery reports match the selected filter" actionLabel="Show All" onAction={() => setTab('all')} />
      ) : (
        <div className="space-y-3">
          {filtered.map(n => (
            <div key={n.awb} className="rounded-lg bg-card shadow-card p-4 hover:shadow-card-md transition-shadow">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-primary">{n.awb}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", reasonColors[n.reason])}>{n.reason}</span>
                  </div>
                  <p className="font-medium text-text-primary">{n.customer}</p>
                  <p className="text-sm text-text-muted">{n.phone}</p>
                </div>
                <div className="text-sm">
                  <p className="text-text-muted">Seller: <span className="text-text-secondary">{n.seller}</span></p>
                  <p className="text-text-muted">Attempts: <span className="font-medium text-text-primary">{n.attempts}/3</span></p>
                  <p className="text-text-muted">Last update: {n.lastUpdate}</p>
                </div>
                <div className="flex items-center gap-2">
                  {n.status === 'Active' && (
                    <>
                      <Button size="sm" className="text-xs h-8 bg-primary text-primary-foreground gap-1" onClick={() => handleAction(n.awb, 'Re-attempt')}>
                        <ArrowRight className="h-3 w-3" />Re-attempt
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-8 gap-1" onClick={() => toast.info(`Calling ${n.customer}...`)}>
                        <Phone className="h-3 w-3" />Call
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-8 text-danger border-danger/30 hover:bg-danger-light gap-1" onClick={() => handleAction(n.awb, 'Force RTO')}>
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
    </div>
  );
}
