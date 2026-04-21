import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Save, Send, FileText, Trash2, Pencil, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProductRequests, type ProductRequest } from "@/hooks/useSupplierProducts";
import { ProductStatusBadge } from "@/components/supplier/StatusBadge";

const empty = {
  name: "", category: "", proposed_sku: "", estimated_price: 0, description: "",
  supplier_remarks: "", priority: "normal", expected_stock: 0, variant_info: "",
};

export default function NewProductRequest() {
  const navigate = useNavigate();
  const { role, userId, userName, isDemoMode } = useAuth();
  const { data, isLoading, refetch } = useProductRequests();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRequest | null>(null);
  const [viewing, setViewing] = useState<ProductRequest | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (role === "dropshipper") {
      toast.error("Dropshippers cannot create product requests");
      navigate(`/${role}/products`, { replace: true });
    }
  }, [role, navigate]);

  const reset = () => { setForm(empty); setEditing(null); };
  const openCreate = () => { reset(); setOpen(true); };
  const openEdit = (r: ProductRequest) => {
    setEditing(r);
    setForm({
      name: r.name, category: r.category, proposed_sku: r.proposed_sku,
      estimated_price: r.estimated_price, description: r.description,
      supplier_remarks: r.supplier_remarks, priority: r.priority,
      expected_stock: r.expected_stock, variant_info: r.variant_info,
    });
    setOpen(true);
  };

  const save = async (status: "draft" | "pending") => {
    if (!form.name.trim()) { toast.error("Product name required"); return; }
    setSaving(true);
    try {
      const payload = {
        request_id: editing?.request_id || `PRQ-${Date.now()}`,
        user_id: userId,
        name: form.name, category: form.category || null, proposed_sku: form.proposed_sku || null,
        estimated_price: form.estimated_price, description: form.description || null,
        supplier_remarks: form.supplier_remarks || null, priority: form.priority,
        expected_stock: form.expected_stock, variant_info: form.variant_info || null,
        status,
      };
      if (isDemoMode) {
        const stored = localStorage.getItem("product_requests_demo");
        const list = stored ? JSON.parse(stored) : [];
        if (editing) {
          const i = list.findIndex((x: any) => x.id === editing.id);
          if (i >= 0) list[i] = { ...list[i], ...payload };
        } else {
          list.unshift({ ...payload, id: `demo-${Date.now()}`, created_at: new Date().toISOString(), images: [], compliance_docs: [] });
        }
        localStorage.setItem("product_requests_demo", JSON.stringify(list));
      } else if (editing) {
        const { error } = await supabase.from("product_requests").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("product_requests").insert(payload);
        if (error) throw error;
      }
      toast.success(status === "pending" ? "Request submitted" : "Saved as draft");
      setOpen(false); reset(); refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  };

  const remove = async (r: ProductRequest) => {
    if (r.status !== "draft") { toast.error("Only drafts can be deleted"); return; }
    if (isDemoMode) {
      const stored = localStorage.getItem("product_requests_demo");
      const list = stored ? JSON.parse(stored) : [];
      localStorage.setItem("product_requests_demo", JSON.stringify(list.filter((x: any) => x.id !== r.id)));
    } else {
      const { error } = await supabase.from("product_requests").delete().eq("id", r.id);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Deleted"); refetch();
  };

  const resubmit = async (r: ProductRequest) => {
    if (isDemoMode) {
      const stored = localStorage.getItem("product_requests_demo");
      const list = stored ? JSON.parse(stored) : [];
      const i = list.findIndex((x: any) => x.id === r.id);
      if (i >= 0) { list[i].status = "pending"; localStorage.setItem("product_requests_demo", JSON.stringify(list)); }
    } else {
      const { error } = await supabase.from("product_requests").update({ status: "pending" }).eq("id", r.id);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Resubmitted"); refetch();
  };

  const filterBy = (s: string) => data.filter(r => s === "all" || r.status === s);

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="New Product Request" breadcrumb={[role.charAt(0).toUpperCase() + role.slice(1), "New Product Request"]}
        actions={<Button className="bg-warning text-warning-foreground hover:bg-warning/90" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Create New Request</Button>}
      />

      <div className="rounded-xl bg-card shadow-card p-4 mb-4">
        <p className="text-sm text-text-muted">Submit a request when you want to add a new product that requires admin approval. Approved requests can be promoted into your product catalogue.</p>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="bg-surface-2">
          {["all","draft","pending","approved","rejected","needs_changes"].map(s => (
            <TabsTrigger key={s} value={s} className="capitalize text-xs">{s.replace("_", " ")}</TabsTrigger>
          ))}
        </TabsList>
        {["all","draft","pending","approved","rejected","needs_changes"].map(s => (
          <TabsContent key={s} value={s}>
            <div className="rounded-xl bg-card shadow-card mt-3 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-text-muted text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left">Request ID</th>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-left">Submitted</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Admin Remark</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-text-muted">Loading…</td></tr>
                  ) : filterBy(s).length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-text-muted">No requests</td></tr>
                  ) : filterBy(s).map(r => (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-2/40">
                      <td className="px-3 py-2 font-mono text-xs">{r.request_id}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-text-muted">{r.category || "—"}</td>
                      <td className="px-3 py-2 text-text-muted text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td className="px-3 py-2"><ProductStatusBadge status={r.status} /></td>
                      <td className="px-3 py-2 text-xs text-text-muted max-w-[200px] truncate">{r.admin_remark || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewing(r)}><Eye className="h-3.5 w-3.5" /></Button>
                          {(r.status === "draft" || r.status === "needs_changes") && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                          )}
                          {r.status === "needs_changes" && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => resubmit(r)}><Send className="h-3.5 w-3.5" /></Button>
                          )}
                          {r.status === "draft" && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(r)}><Trash2 className="h-3.5 w-3.5 text-danger" /></Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Create/Edit modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Request" : "Create New Request"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2"><Label>Product Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{["Apparel","Electronics","Home & Kitchen","Beauty","Sports","Toys","Books","Automotive","Arts & Entertainment"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Proposed SKU</Label><Input value={form.proposed_sku} onChange={e => setForm({ ...form, proposed_sku: e.target.value })} /></div>
            <div><Label>Estimated Price (₹)</Label><Input type="number" value={form.estimated_price} onChange={e => setForm({ ...form, estimated_price: Number(e.target.value) || 0 })} /></div>
            <div><Label>Expected Stock</Label><Input type="number" value={form.expected_stock} onChange={e => setForm({ ...form, expected_stock: Number(e.target.value) || 0 })} /></div>
            <div><Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Variant Info</Label><Input value={form.variant_info} onChange={e => setForm({ ...form, variant_info: e.target.value })} placeholder="e.g. 3 colors, 4 sizes" /></div>
            <div className="md:col-span-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Supplier Remarks</Label><Textarea rows={2} value={form.supplier_remarks} onChange={e => setForm({ ...form, supplier_remarks: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => save("draft")} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Save Draft</Button>
            <Button className="bg-warning text-warning-foreground hover:bg-warning/90" onClick={() => save("pending")} disabled={saving}><Send className="h-4 w-4 mr-1" />Submit Request</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View modal */}
      <Dialog open={!!viewing} onOpenChange={o => !o && setViewing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{viewing?.name}</DialogTitle><DialogDescription>{viewing?.request_id} · {viewing?.status}</DialogDescription></DialogHeader>
          {viewing && (
            <div className="space-y-2 text-sm">
              <p><span className="text-text-muted">Category:</span> {viewing.category || "—"}</p>
              <p><span className="text-text-muted">Proposed SKU:</span> {viewing.proposed_sku || "—"}</p>
              <p><span className="text-text-muted">Estimated Price:</span> ₹{viewing.estimated_price}</p>
              <p><span className="text-text-muted">Expected Stock:</span> {viewing.expected_stock}</p>
              <p><span className="text-text-muted">Priority:</span> {viewing.priority}</p>
              <p><span className="text-text-muted">Variants:</span> {viewing.variant_info || "—"}</p>
              <p><span className="text-text-muted">Description:</span><br />{viewing.description || "—"}</p>
              <p><span className="text-text-muted">Supplier Remarks:</span><br />{viewing.supplier_remarks || "—"}</p>
              {viewing.admin_remark && (
                <div className="rounded-md bg-warning-light p-3">
                  <p className="text-xs uppercase font-bold text-warning-dark mb-1">Admin Remark</p>
                  <p className="text-sm text-text-primary">{viewing.admin_remark}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
