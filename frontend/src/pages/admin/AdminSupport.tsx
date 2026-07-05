import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Headphones, Loader2, RefreshCw } from "lucide-react";
import * as adminWorkflowService from "@/services/adminWorkflowService";
import { SUPPORT_CATEGORIES, categoryLabel } from "@/services/supportService";
import type { SupportTicketListItem } from "@/services/adminWorkflowService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";

export default function AdminSupport() {
  const [items, setItems] = useState<SupportTicketListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [admins, setAdmins] = useState<adminWorkflowService.AdminUserBrief[]>([]);
  const [comment, setComment] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminWorkflowService.adminListSupportTickets({
        page: String(page),
        limit: String(limit),
        status: statusFilter !== "all" ? statusFilter : undefined,
        priority: priorityFilter !== "all" ? priorityFilter : undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        role: roleFilter !== "all" ? roleFilter : undefined,
        user: userFilter || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      setItems(r.items ?? []);
      setTotal(r.total ?? 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof ApiError ? e.message : "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, priorityFilter, categoryFilter, roleFilter, userFilter, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await adminWorkflowService.adminListAdminUsers();
        setAdmins(Array.isArray(rows) ? rows : []);
      } catch {
        setAdmins([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    void (async () => {
      setDetailLoading(true);
      try {
        const d = await adminWorkflowService.adminGetSupportTicket(detailId);
        setDetail(d);
      } catch {
        setDetail(null);
        toast.error("Could not load ticket");
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [detailId]);

  const patchTicket = async (body: { status?: string; priority?: string; assigneeUserId?: string | null }) => {
    if (!detailId) return;
    setSaving(true);
    try {
      await adminWorkflowService.adminPatchSupportTicket(detailId, body);
      toast.success("Ticket updated");
      window.dispatchEvent(new CustomEvent("shipamaze:refetch:notifications"));
      await load();
      setDetail(await adminWorkflowService.adminGetSupportTicket(detailId));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const sendComment = async () => {
    if (!detailId || !comment.trim()) return;
    setSaving(true);
    try {
      await adminWorkflowService.adminAddSupportTicketComment(detailId, comment.trim(), internalNote);
      toast.success(internalNote ? "Internal note added" : "Reply sent");
      setComment("");
      setInternalNote(false);
      window.dispatchEvent(new CustomEvent("shipamaze:refetch:notifications"));
      setDetail(await adminWorkflowService.adminGetSupportTicket(detailId));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to add comment");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const comments = (detail?.comments as Record<string, unknown>[] | undefined) ?? [];
  const requester = detail?.requester as Record<string, unknown> | undefined;
  const assignee = detail?.assignee as { id?: string } | null | undefined;

  return (
    <div className="animate-fade-in-up space-y-4">
      <PageHeader title="Support Dashboard" breadcrumb={["Admin", "Support"]} />

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap rounded-lg border border-border bg-card p-4 shadow-card">
        <Input
          placeholder="Vendor / dropshipper"
          value={userFilter}
          onChange={(e) => { setUserFilter(e.target.value); setPage(1); }}
          className="sm:w-44"
        />
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="vendor">Vendor</SelectItem>
            <SelectItem value="dropshipper">Dropshipper</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="waiting_for_user">Waiting for user</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={priorityFilter}
          onValueChange={(v) => {
            setPriorityFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {SUPPORT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="sm:w-36" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="sm:w-36" />
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-light/30 px-4 py-3 text-sm flex justify-between gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {loading && !items.length ? (
        <div className="animate-pulse p-8 text-text-muted">Loading tickets…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Headphones}
          title="No support tickets"
          description="Tickets appear when vendors or dropshippers contact support via the API."
        />
      ) : (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto border border-border">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left font-medium text-text-secondary">Ticket</th>
                <th className="p-3 text-left font-medium text-text-secondary">Requester</th>
                <th className="p-3 text-left font-medium text-text-secondary">Category</th>
                <th className="p-3 text-left font-medium text-text-secondary">Priority</th>
                <th className="p-3 text-left font-medium text-text-secondary">Status</th>
                <th className="p-3 text-left font-medium text-text-secondary">Created</th>
                <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                  <td className="p-3">
                    <p className="font-medium text-text-primary">{t.ticketNumber}</p>
                    <p className="text-xs text-text-muted truncate max-w-[220px]">{t.title}</p>
                  </td>
                  <td className="p-3 text-xs text-text-secondary">
                    {t.requester?.name}
                    <br />
                    {t.requester?.email}
                    <br />
                    <span className="capitalize">{t.requester?.role}</span>
                  </td>
                  <td className="p-3 capitalize text-xs">{categoryLabel(t.category ?? "others")}</td>
                  <td className="p-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        t.priority === "high"
                          ? "bg-danger-light text-danger-dark"
                          : t.priority === "medium"
                            ? "bg-warning-light text-warning-dark"
                            : "bg-surface-2 text-text-muted"
                      )}
                    >
                      {t.priority}
                    </span>
                  </td>
                  <td className="p-3 capitalize text-text-secondary">{t.status.replace("_", " ")}</td>
                  <td className="p-3 text-xs text-text-muted whitespace-nowrap">
                    {t.createdAt ? new Date(t.createdAt).toLocaleString("en-IN") : "—"}
                  </td>
                  <td className="p-3">
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setDetailId(t.id)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-left pr-8">Ticket detail</SheetTitle>
          </SheetHeader>
          {detailLoading && <p className="text-sm text-text-muted mt-4">Loading…</p>}
          {!detailLoading && detail && (
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-xs text-text-muted">{String(detail.ticketNumber ?? "")}</p>
                <p className="font-semibold text-text-primary text-base">{String(detail.title ?? "")}</p>
                <p className="text-text-secondary mt-2 whitespace-pre-wrap">{String(detail.description ?? "")}</p>
              </div>
              <p>
                <span className="text-text-muted">Requester:</span> {String(requester?.name ?? "")} (
                {String(requester?.email ?? "")}) · {String(requester?.role ?? "")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={String(detail.status ?? "open")}
                  onValueChange={(v) => void patchTicket({ status: v })}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="waiting_for_user">Waiting for user</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={String(detail.priority ?? "medium")}
                  onValueChange={(v) => void patchTicket({ priority: v })}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted mb-1">Assignee (admin)</p>
                <Select
                  value={assignee?.id ? String(assignee.id) : "none"}
                  onValueChange={(v) => void patchTicket({ assigneeUserId: v === "none" ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {admins.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="border-t border-border pt-3 space-y-2">
                <p className="font-medium text-text-primary">Activity</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {comments.map((c, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-md border border-border p-2 text-xs",
                        c.isInternal ? "bg-warning-light/20 border-warning/30" : "bg-surface-2/40"
                      )}
                    >
                      <p className="text-text-primary">{String(c.body ?? "")}</p>
                      <p className="text-text-muted mt-1">
                        {c.isInternal ? "Internal · " : ""}
                        {c.createdAt ? new Date(String(c.createdAt)).toLocaleString("en-IN") : ""}
                      </p>
                    </div>
                  ))}
                  {!comments.length && <p className="text-text-muted text-xs">No comments yet.</p>}
                </div>
                <Textarea
                  placeholder="Reply to customer or add internal note…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="min-h-[80px]"
                />
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={internalNote}
                    onChange={(e) => setInternalNote(e.target.checked)}
                  />
                  Internal note (not visible to requester)
                </label>
                <Button size="sm" disabled={saving || !comment.trim()} onClick={() => void sendComment()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
