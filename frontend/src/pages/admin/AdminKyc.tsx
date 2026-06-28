import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, RefreshCw, Search, Eye } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as kycService from "@/services/kycService";
import type { AdminKycRow } from "@/services/kycService";
import { ApiError } from "@/lib/apiClient";

function statusBadge(status?: string) {
  const map: Record<string, string> = {
    pending: "bg-warning-light/60 text-warning-dark border-warning/40",
    pending_approval: "bg-warning-light/60 text-warning-dark border-warning/40",
    verified: "bg-success-light/60 text-success-dark border-success/40",
    approved: "bg-success-light/60 text-success-dark border-success/40",
    rejected: "bg-danger-light/60 text-danger-dark border-danger/40",
    draft: "bg-surface-2 text-text-secondary border-border",
    pending_kyc: "bg-surface-2 text-text-secondary border-border",
  };
  const key = status ?? "draft";
  return (
    <Badge variant="outline" className={cn(map[key] ?? map.draft)}>
      {kycService.kycStatusLabel(status as kycService.KycStatus)}
    </Badge>
  );
}

export default function AdminKyc() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminKycRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminKycRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejectUserId, setRejectUserId] = useState<string | null>(null);
  const [rejectRemark, setRejectRemark] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await kycService.listAdminKyc(statusFilter === "all" ? "all" : statusFilter);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load KYC queue");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (!deferredSearch) return true;
    return (
      r.name.toLowerCase().includes(deferredSearch) ||
      r.email.toLowerCase().includes(deferredSearch) ||
      (r.business_name ?? "").toLowerCase().includes(deferredSearch) ||
      (r.pan_number ?? "").toLowerCase().includes(deferredSearch)
    );
  }), [rows, deferredSearch]);

  const openDetail = async (row: AdminKycRow) => {
    setDetail(row);
    setDetailLoading(true);
    try {
      const full = await kycService.getAdminKyc(row.userId);
      setDetail(full);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load KYC details");
    } finally {
      setDetailLoading(false);
    }
  };

  const approve = async (userId: string) => {
    setActing(userId);
    try {
      await kycService.approveKyc(userId);
      toast.success("KYC approved — account activated");
      setDetail(null);
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Approve failed");
    } finally {
      setActing(null);
    }
  };

  const reject = async () => {
    if (!rejectUserId || !rejectRemark.trim()) {
      toast.error("Rejection remark is required");
      return;
    }
    setActing(rejectUserId);
    try {
      await kycService.rejectKyc(rejectUserId, rejectRemark.trim());
      toast.success("KYC rejected");
      setRejectUserId(null);
      setRejectRemark("");
      setDetail(null);
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Reject failed");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="animate-fade-in-up space-y-4">
      <PageHeader
        title="KYC Approvals"
        breadcrumb={["Admin", "KYC"]}
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input placeholder="Search name, email, PAN…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending Approval</SelectItem>
            <SelectItem value="pending_kyc">Pending KYC</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-8 text-text-muted"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-text-muted">No KYC submissions in this queue</div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left">Account</th>
                <th className="p-3 text-left">Business / PAN</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Submitted</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.userId} className="border-b border-border/60 hover:bg-surface-2/30">
                  <td className="p-3">
                    <p className="font-medium text-text-primary">{r.name}</p>
                    <p className="text-xs text-text-muted">{r.email}</p>
                    {r.role && <p className="text-[11px] text-text-muted capitalize">{r.role}</p>}
                  </td>
                  <td className="p-3">
                    <p>{r.business_name || r.full_name || "—"}</p>
                    <p className="text-xs font-mono text-text-muted">{r.pan_number || "—"}</p>
                  </td>
                  <td className="p-3 capitalize">{r.account_type}</td>
                  <td className="p-3">{statusBadge(r.kycStatus ?? r.status)}</td>
                  <td className="p-3 text-text-muted text-xs">{r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "—"}</td>
                  <td className="p-3 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => void openDetail(r)}><Eye className="h-4 w-4" /></Button>
                    {(r.kycStatus === "pending_approval" || r.status === "pending") && (
                      <>
                        <Button size="sm" variant="outline" className="text-success" disabled={acting === r.userId} onClick={() => void approve(r.userId)}>
                          {acting === r.userId ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        </Button>
                        <Button size="sm" variant="outline" className="text-danger" disabled={!!acting} onClick={() => setRejectUserId(r.userId)}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>KYC Details</DialogTitle></DialogHeader>
          {detailLoading && (
            <div className="flex items-center gap-2 rounded-md bg-surface-2/50 p-3 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading full KYC documents...
            </div>
          )}
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-text-primary">{detail.name}</p>
                  <p className="text-text-muted">{detail.email}</p>
                  {detail.phone && <p className="text-text-muted text-xs">{detail.phone}</p>}
                </div>
                {statusBadge(detail.kycStatus ?? detail.status)}
              </div>

              <div className="rounded-md bg-surface-2/60 border border-border p-3 space-y-1">
                <p className="font-medium text-text-primary mb-2">Account Type: <span className="capitalize font-normal">{detail.account_type}</span></p>
                {detail.full_name && <div className="grid grid-cols-2 gap-1"><span className="text-text-muted">Full name:</span><span>{detail.full_name}</span></div>}
                {detail.dob && <div className="grid grid-cols-2 gap-1"><span className="text-text-muted">Date of birth:</span><span>{detail.dob}</span></div>}
                {detail.business_name && <div className="grid grid-cols-2 gap-1"><span className="text-text-muted">Business name:</span><span>{detail.business_name}</span></div>}
                {detail.pan_number && <div className="grid grid-cols-2 gap-1"><span className="text-text-muted">PAN:</span><span className="font-mono">{detail.pan_number}</span></div>}
                {detail.aadhaar_number && <div className="grid grid-cols-2 gap-1"><span className="text-text-muted">Aadhaar:</span><span className="font-mono">{detail.aadhaar_number}</span></div>}
                {detail.gst_number && <div className="grid grid-cols-2 gap-1"><span className="text-text-muted">GST:</span><span className="font-mono">{detail.gst_number}</span></div>}
                {detail.cin_number && <div className="grid grid-cols-2 gap-1"><span className="text-text-muted">CIN:</span><span className="font-mono">{detail.cin_number}</span></div>}
                {detail.authorized_person_name && (
                  <div className="grid grid-cols-2 gap-1"><span className="text-text-muted">Auth. person:</span><span>{detail.authorized_person_name}</span></div>
                )}
                {detail.authorized_person_pan && (
                  <div className="grid grid-cols-2 gap-1"><span className="text-text-muted">Auth. person PAN:</span><span className="font-mono">{detail.authorized_person_pan}</span></div>
                )}
                {detail.address && <div className="grid grid-cols-2 gap-1"><span className="text-text-muted">Address:</span><span>{detail.address}</span></div>}
              </div>

              {detail.rejectionRemark && (
                <div className="rounded-md border border-danger/30 bg-danger-light/40 p-3 text-danger-dark">{detail.rejectionRemark}</div>
              )}

              <div className="space-y-2">
                <p className="font-medium">Uploaded Documents</p>
                {(() => {
                  const allDocs = { ...(detail.documents ?? {}), ...(detail.uploaded_docs ?? {}) };
                  const docLabels: Record<string, string> = {
                    pan: "PAN Card",
                    aadhaarFront: "Aadhaar Front",
                    aadhaarBack: "Aadhaar Back",
                    aadhaar: "Aadhaar (legacy)",
                    gst: "GST Certificate",
                    cin: "CIN Document",
                    reg: "Registration Document",
                    auth_id: "Authorized Person ID",
                  };

                  const normalizeDocUrl = (raw: string) => {
                    const url = String(raw ?? "").trim();
                    if (!url) return "";
                    if (url.startsWith("data:") || /^https?:\/\//i.test(url)) return url;
                    if (/^\/\//.test(url)) return `https:${url}`;
                    if (/^[A-Za-z0-9+/=\s]+$/.test(url) && url.length > 100) {
                      const compact = url.replace(/\s/g, "");
                      const mime = compact.startsWith("JVBER") ? "application/pdf" : "image/jpeg";
                      return `data:${mime};base64,${compact}`;
                    }
                    return url;
                  };

                  const openDoc = (url: string, label: string) => {
                    const src = normalizeDocUrl(url);
                    const win = window.open("", "_blank");
                    if (!win) return;
                    const isPdf = src.startsWith("data:application/pdf") || /\.pdf($|\?)/i.test(src);
                    win.document.write(
                      `<!DOCTYPE html><html><head><title>${label}</title>` +
                      `<style>*{box-sizing:border-box}body{margin:0;background:#111;min-height:100vh;display:flex;justify-content:center;align-items:flex-start;padding:16px;}` +
                      `img,iframe{max-width:100%;width:100%;height:auto;min-height:90vh;background:#fff;border:0;object-fit:contain;}</style></head>` +
                      `<body>${isPdf ? `<iframe src="${src}" title="${label}"></iframe>` : `<img src="${src}" alt="${label}" />`}</body></html>`
                    );
                    win.document.close();
                  };

                  const entries = Object.entries(allDocs).filter(([, v]) => !!v);
                  if (entries.length === 0) return <p className="text-text-muted text-xs">No documents uploaded.</p>;
                  return entries.map(([key, url]) => {
                    const label = docLabels[key] ?? key;
                    const normalizedUrl = normalizeDocUrl(url);
                    const isViewable = normalizedUrl.startsWith("data:") || normalizedUrl.startsWith("http") || normalizedUrl.length > 100;
                    return (
                      <div key={key} className="flex items-center justify-between gap-2 rounded border border-border p-2.5 bg-surface-2/30">
                        <span className="font-medium text-text-primary">{label}</span>
                        {isViewable ? (
                          <button
                            type="button"
                            onClick={() => openDoc(url, label)}
                            className="text-primary text-xs hover:underline font-medium flex items-center gap-1"
                          >
                            View document ↗
                          </button>
                        ) : (
                          <span className="text-xs text-text-muted truncate max-w-[200px]">{url}</span>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              {(detail.kycStatus === "pending_approval" || detail.status === "pending") && (
                <DialogFooter className="gap-2">
                  <Button variant="outline" className="text-danger" onClick={() => { setRejectUserId(detail.userId); setDetail(null); }}>Reject</Button>
                  <Button onClick={() => void approve(detail.userId)} disabled={acting === detail.userId}>Approve & Activate</Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectUserId} onOpenChange={(o) => !o && setRejectUserId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject KYC</DialogTitle></DialogHeader>
          <Input placeholder="Rejection remark (required)" value={rejectRemark} onChange={(e) => setRejectRemark(e.target.value)} />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRejectUserId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void reject()} disabled={!!acting}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
