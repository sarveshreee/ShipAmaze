import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { Headphones, Loader2, MessageSquarePlus, Send } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import * as supportService from "@/services/supportService";
import type { SupportComment, SupportTicketSummary } from "@/services/supportService";

type Props = {
  roleLabel: "Vendor" | "Dropshipper";
  breadcrumbRoot: string;
};

export default function SupportTicketsPage({ roleLabel, breadcrumbRoot }: Props) {
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("others");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentName, setAttachmentName] = useState("");

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await supportService.listMySupportTickets();
      setTickets(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setTickets([]);
      toast.error(e instanceof ApiError ? e.message : "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    void (async () => {
      setDetailLoading(true);
      try {
        setDetail(await supportService.getMySupportTicket(detailId));
      } catch {
        setDetail(null);
        toast.error("Could not load ticket");
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [detailId]);

  const createTicket = async () => {
    if (!subject.trim() || !description.trim()) {
      toast.error("Subject and description are required");
      return;
    }
    setSaving(true);
    try {
      const attachments =
        attachmentUrl.trim()
          ? [{ fileName: attachmentName.trim() || "attachment", url: attachmentUrl.trim() }]
          : undefined;
      const created = await supportService.createSupportTicket({
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        attachments,
      });
      toast.success(`Ticket ${created.ticketNumber} created`);
      setCreateOpen(false);
      setSubject("");
      setDescription("");
      setAttachmentUrl("");
      setAttachmentName("");
      await loadTickets();
      setDetailId(created.id);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not create ticket");
    } finally {
      setSaving(false);
    }
  };

  const sendReply = async () => {
    if (!detailId || !reply.trim()) return;
    setSaving(true);
    try {
      await supportService.addSupportTicketComment(detailId, reply.trim());
      toast.success("Reply sent");
      setReply("");
      setDetail(await supportService.getMySupportTicket(detailId));
      await loadTickets();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to send reply");
    } finally {
      setSaving(false);
    }
  };

  const comments = (detail?.comments as SupportComment[] | undefined) ?? [];

  return (
    <div className="animate-fade-in-up space-y-4">
      <PageHeader
        title="Support"
        breadcrumb={[breadcrumbRoot, "Support"]}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <MessageSquarePlus className="h-4 w-4 mr-1" /> Raise Ticket
          </Button>
        }
      />

      {loading ? (
        <div className="animate-pulse p-8 text-text-muted">Loading tickets…</div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={Headphones}
          title="No support tickets yet"
          description={`Raise a ticket when you need help with orders, Shopify, wallet, or courier issues.`}
          actionLabel="Raise Ticket"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto border border-border">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left font-medium">Ticket</th>
                <th className="p-3 text-left font-medium">Category</th>
                <th className="p-3 text-left font-medium">Priority</th>
                <th className="p-3 text-left font-medium">Status</th>
                <th className="p-3 text-left font-medium">Updated</th>
                <th className="p-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                  <td className="p-3">
                    <p className="font-medium">{t.ticketNumber}</p>
                    <p className="text-xs text-text-muted truncate max-w-[240px]">{t.subject ?? t.title}</p>
                  </td>
                  <td className="p-3 capitalize text-xs">{supportService.categoryLabel(t.category ?? "others")}</td>
                  <td className="p-3 capitalize text-xs">{t.priority}</td>
                  <td className="p-3 capitalize text-xs">{t.status.replace(/_/g, " ")}</td>
                  <td className="p-3 text-xs whitespace-nowrap">
                    {t.updatedAt ? new Date(t.updatedAt).toLocaleString("en-IN") : new Date(t.createdAt).toLocaleString("en-IN")}
                  </td>
                  <td className="p-3">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDetailId(t.id)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Raise Ticket · {roleLabel}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {supportService.SUPPORT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{supportService.categoryLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the issue in detail…" />
            </div>
            <div>
              <Label>Attachment URL (optional)</Label>
              <Input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div>
              <Label>Attachment name (optional)</Label>
              <Input value={attachmentName} onChange={(e) => setAttachmentName(e.target.value)} placeholder="screenshot.png" />
            </div>
            <Button disabled={saving} onClick={() => void createTicket()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit ticket"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-left pr-8">Ticket conversation</SheetTitle>
          </SheetHeader>
          {detailLoading && <p className="text-sm text-text-muted mt-4">Loading…</p>}
          {!detailLoading && detail && (
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-xs text-text-muted">{String(detail.ticketNumber ?? "")}</p>
                <p className="font-semibold text-base">{String(detail.subject ?? detail.title ?? "")}</p>
                <p className="text-xs text-text-muted mt-1 capitalize">
                  {supportService.categoryLabel(String(detail.category ?? "others"))} · {String(detail.status ?? "").replace(/_/g, " ")}
                </p>
                <p className="text-text-secondary mt-2 whitespace-pre-wrap">{String(detail.description ?? "")}</p>
              </div>
              <div className="border-t border-border pt-3 space-y-2">
                <p className="font-medium">Conversation</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {comments.map((c, i) => (
                    <div key={i} className="rounded-md border border-border p-2 text-xs bg-surface-2/40">
                      <p>{c.body}</p>
                      <p className="text-text-muted mt-1">{new Date(c.createdAt).toLocaleString("en-IN")}</p>
                    </div>
                  ))}
                  {!comments.length && <p className="text-text-muted text-xs">No replies yet.</p>}
                </div>
                {String(detail.status) !== "closed" && (
                  <>
                    <Textarea placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)} className="min-h-[80px]" />
                    <Button size="sm" disabled={saving || !reply.trim()} onClick={() => void sendReply()}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3.5 w-3.5 mr-1" /> Send</>}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
