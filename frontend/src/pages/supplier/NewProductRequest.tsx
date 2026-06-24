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
import { Plus, Save, Send, Trash2, Pencil, Eye, Loader2, Image as ImageIcon, X, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import * as productService from "@/services/productService";
import { useAuth } from "@/contexts/AuthContext";
import { useProductRequests, type ProductRequest } from "@/hooks/useSupplierProducts";
import { ProductStatusBadge } from "@/components/supplier/StatusBadge";

const empty = {
  name: "", category: "", proposed_sku: "", estimated_price: 0, description: "",
  supplier_remarks: "", priority: "normal", expected_stock: 0, variant_info: "",
  images: [] as string[],
};

const REQUEST_TABS = ["all", "draft", "pending", "approved", "rejected", "needs_changes"];

function emptyForm() {
  return { ...empty, images: [] as string[] };
}

export default function NewProductRequest() {
  const navigate = useNavigate();
  const { role, userId, userName } = useAuth();
  const { data, isLoading, refetch } = useProductRequests();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRequest | null>(null);
  const [viewing, setViewing] = useState<ProductRequest | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [imgModal, setImgModal] = useState<{ imgs: string[]; idx: number } | null>(null);

  useEffect(() => {
    if (role === "dropshipper") {
      toast.error("Dropshippers cannot access product requests");
      navigate(`/${role}/products`, { replace: true });
    }
  }, [role, navigate]);

  const reset = () => { setForm(emptyForm()); setEditing(null); };
  const openCreate = () => {
    if (role !== "admin") return;
    reset();
    setOpen(true);
  };
  const openEdit = (r: ProductRequest) => {
    if (role !== "admin") return;
    setEditing(r);
    setForm({
      name: r.name, category: r.category, proposed_sku: r.proposed_sku,
      estimated_price: r.estimated_price, description: r.description,
      supplier_remarks: r.supplier_remarks, priority: r.priority,
      expected_stock: r.expected_stock, variant_info: r.variant_info,
      images: r.images ?? [],
    });
    setOpen(true);
  };

  const save = async (status: "draft" | "pending") => {
    if (role !== "admin") return;
    if (!form.name.trim()) { toast.error("Product name required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        category: form.category || undefined,
        proposed_sku: form.proposed_sku || undefined,
        estimated_price: form.estimated_price,
        description: form.description || undefined,
        supplier_remarks: form.supplier_remarks || undefined,
        priority: form.priority,
        expected_stock: form.expected_stock,
        variant_info: form.variant_info || undefined,
        images: form.images,
        status,
        requested_by_role: "admin",
        requested_by_name: userName || undefined,
      };
      if (editing) {
        await productService.updateProductRequest(editing.id, payload);
      } else {
        await productService.createProductRequest(payload);
      }
      toast.success(status === "pending" ? "Request submitted" : "Saved as draft");
      setOpen(false);
      reset();
      refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setSaving(false); }
  };

  const remove = async (r: ProductRequest) => {
    if (role !== "admin") return;
    if (r.status !== "draft") { toast.error("Only drafts can be deleted"); return; }
    try {
      await productService.deleteProductRequest(r.id);
      toast.success("Deleted");
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const resubmit = async (r: ProductRequest) => {
    if (role !== "admin") return;
    try {
      await productService.updateProductRequest(r.id, { status: "pending" });
      toast.success("Resubmitted");
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const respond = async (r: ProductRequest, status: "approved" | "rejected") => {
    if (role !== "vendor") return;
    try {
      await productService.updateProductRequest(r.id, {
        status,
        supplier_remarks: form.supplier_remarks || r.supplier_remarks,
        vendor_id: userId,
        vendor_name: userName || undefined,
      });
      toast.success(status === "approved" ? "Product request approved" : "Product request rejected");
      setViewing(null);
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const readCompressedImage = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not load image"));
        img.onload = () => {
          const maxSide = 900;
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Could not process image"));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.78));
        };
        img.src = String(reader.result ?? "");
      };
      reader.readAsDataURL(file);
    });

  const onPickImages = async (files: FileList | null) => {
    if (!files) return;
    const picked = Array.from(files).filter((f) => /image\/(jpeg|png|webp|jpg)/i.test(f.type) && f.size < 5 * 1024 * 1024);
    if (picked.length === 0) {
      toast.error("Only JPG/PNG/WEBP under 5MB");
      return;
    }
    if (form.images.length + picked.length > 6) {
      toast.error("Maximum 6 images per request");
      return;
    }
    try {
      const urls = await Promise.all(picked.map(readCompressedImage));
      setForm((prev) => ({ ...prev, images: [...prev.images, ...urls] }));
      toast.success(`${urls.length} image${urls.length > 1 ? "s" : ""} uploaded`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Image upload failed");
    }
  };

  const filterBy = (s: string) => data.filter(r => s === "all" || r.status === s);

  return (
    <div className="animate-fade-in-up">
      <PageHeader title={role === "vendor" ? "Requested Product" : "New Product Request"} breadcrumb={[role.charAt(0).toUpperCase() + role.slice(1), role === "vendor" ? "Requested Product" : "New Product Request"]}
        actions={role === "admin" ? <Button className="bg-warning text-warning-foreground hover:bg-warning/90" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Create New Request</Button> : undefined}
      />

      <div className="rounded-xl bg-card shadow-card p-4 mb-4">
        <p className="text-sm text-text-muted">
          {role === "vendor"
            ? "Review products requested by admin. Approve a request if you can supply that product."
            : "Create product requests for vendors. Approved requests will show back to admin."}
        </p>
      </div>

      <Tabs defaultValue="all">
        {role === "admin" && (
          <TabsList className="bg-surface-2">
            {REQUEST_TABS.map(s => (
              <TabsTrigger key={s} value={s} className="capitalize text-xs">{s.replace("_", " ")}</TabsTrigger>
            ))}
          </TabsList>
        )}
        {(role === "vendor" ? ["all"] : REQUEST_TABS).map(s => (
          <TabsContent key={s} value={s}>
            <div className="rounded-xl bg-card shadow-card mt-3 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-text-muted text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left">Request ID</th>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">Image</th>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-left">Submitted</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Admin Remark</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-text-muted">Loading…</td></tr>
                  ) : filterBy(s).length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-text-muted">No requests</td></tr>
                  ) : filterBy(s).map(r => (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-2/40">
                      <td className="px-3 py-2 font-mono text-xs">{r.request_id}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2">
                        {r.images?.[0]
                          ? <button type="button" onClick={() => setImgModal({ imgs: r.images!, idx: 0 })} className="focus:outline-none"><img src={r.images[0]} alt="" className="h-10 w-10 rounded object-cover border border-border hover:opacity-80 cursor-pointer" /></button>
                          : <span className="text-xs text-text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2 text-text-muted">{r.category || "—"}</td>
                      <td className="px-3 py-2 text-text-muted text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td className="px-3 py-2"><ProductStatusBadge status={r.status} /></td>
                      <td className="px-3 py-2 text-xs text-text-muted max-w-[200px] truncate">{r.admin_remark || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewing(r)}><Eye className="h-3.5 w-3.5" /></Button>
                          {role === "admin" && (r.status === "draft" || r.status === "needs_changes") && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                          )}
                          {role === "admin" && r.status === "needs_changes" && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => resubmit(r)}><Send className="h-3.5 w-3.5" /></Button>
                          )}
                          {role === "vendor" && r.status === "pending" && (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => respond(r, "approved")}><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-danger" onClick={() => respond(r, "rejected")}><XCircle className="h-3.5 w-3.5" /></Button>
                            </>
                          )}
                          {role === "admin" && r.status === "draft" && (
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
            <div className="md:col-span-2">
              <Label>Product Images</Label>
              <label className="mt-1 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border p-4 text-center hover:border-warning">
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPickImages(e.target.files)} />
                <ImageIcon className="mb-1 h-6 w-6 text-text-muted" />
                <span className="text-sm font-medium text-text-primary">Upload product reference images</span>
                <span className="text-xs text-text-muted">PNG, JPG, WEBP up to 5MB each</span>
              </label>
              {form.images.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.images.map((img, i) => (
                    <div key={i} className="relative">
                      <img src={img} alt="" className="h-16 w-16 rounded border border-border object-cover" />
                      <button type="button" className="absolute -right-1 -top-1 rounded-full bg-danger p-0.5 text-white" onClick={() => setForm((prev) => ({ ...prev, images: prev.images.filter((_, idx) => idx !== i) }))}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="md:col-span-2"><Label>Admin Remarks</Label><Textarea rows={2} value={form.supplier_remarks} onChange={e => setForm({ ...form, supplier_remarks: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => save("draft")} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Save Draft</Button>
            <Button className="bg-warning text-warning-foreground hover:bg-warning/90" onClick={() => save("pending")} disabled={saving}><Send className="h-4 w-4 mr-1" />Submit Request</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image lightbox */}
      <Dialog open={!!imgModal} onOpenChange={o => !o && setImgModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Product Images</DialogTitle></DialogHeader>
          {imgModal && (
            <div className="relative">
              <div className="bg-surface-2 rounded-lg flex items-center justify-center aspect-video overflow-hidden">
                <img src={imgModal.imgs[imgModal.idx]} alt="" className="max-h-full max-w-full object-contain" />
              </div>
              {imgModal.imgs.length > 1 && (
                <>
                  <button onClick={() => setImgModal(m => m ? { ...m, idx: (m.idx - 1 + m.imgs.length) % m.imgs.length } : m)} className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-card border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button onClick={() => setImgModal(m => m ? { ...m, idx: (m.idx + 1) % m.imgs.length } : m)} className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-card border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="flex justify-center gap-1.5 mt-3">
                    {imgModal.imgs.map((_, i) => (
                      <button key={i} onClick={() => setImgModal(m => m ? { ...m, idx: i } : m)} className={`h-1.5 rounded-full transition-all ${i === imgModal.idx ? "w-6 bg-primary" : "w-1.5 bg-border"}`} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
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
              {viewing.images?.length > 0 && (
                <div>
                  <p className="text-text-muted mb-1">Images:</p>
                  <div className="flex flex-wrap gap-2">
                    {viewing.images.map((img, i) => (
                      <button key={i} type="button" onClick={() => setImgModal({ imgs: viewing.images!, idx: i })} className="focus:outline-none">
                        <img src={img} alt="" className="h-20 w-20 rounded border border-border object-cover hover:opacity-80 cursor-pointer" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p><span className="text-text-muted">Remarks:</span><br />{viewing.supplier_remarks || "—"}</p>
              {viewing.admin_remark && (
                <div className="rounded-md bg-warning-light p-3">
                  <p className="text-xs uppercase font-bold text-warning-dark mb-1">Admin Remark</p>
                  <p className="text-sm text-text-primary">{viewing.admin_remark}</p>
                </div>
              )}
              {role === "vendor" && viewing.status === "pending" && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" className="text-danger" onClick={() => respond(viewing, "rejected")}><XCircle className="h-4 w-4 mr-1" />Reject</Button>
                  <Button onClick={() => respond(viewing, "approved")}><CheckCircle2 className="h-4 w-4 mr-1" />Approve Request</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
