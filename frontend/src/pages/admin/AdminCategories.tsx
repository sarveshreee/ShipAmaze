import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import * as categoryService from "@/services/categoryService";
import type { CategoryRow } from "@/services/categoryService";
import { invalidateCategoryCache } from "@/hooks/useCategories";
import { ApiError } from "@/lib/apiClient";

const emptyForm = (): Partial<CategoryRow> => ({
  name: "",
  slug: "",
  emoji: "",
  imageUrl: "",
  displayOrder: 0,
  enabled: true,
  defaultHsn: "",
});

export default function AdminCategories() {
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [form, setForm] = useState<Partial<CategoryRow>>(emptyForm());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await categoryService.listCategories(true);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load categories");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (row: CategoryRow) => {
    setEditing(row);
    setForm({ ...row });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name?.trim()) {
      toast.error("Category name is required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await categoryService.updateCategory(editing.id, form);
        toast.success("Category updated");
      } else {
        await categoryService.createCategory(form);
        toast.success("Category created");
      }
      invalidateCategoryCache();
      setModalOpen(false);
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: CategoryRow) => {
    if (!confirm(`Delete category "${row.name}"?`)) return;
    try {
      await categoryService.deleteCategory(row.id);
      invalidateCategoryCache();
      toast.success("Category deleted");
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  const onImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast.error("Image max 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((p) => ({ ...p, imageUrl: String(reader.result ?? "") }));
    reader.readAsDataURL(f);
  };

  return (
    <div className="animate-fade-in-up space-y-4">
      <PageHeader
        title="Create Category"
        breadcrumb={["Admin", "Products", "Categories"]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" /> New Category
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center gap-2 p-8 text-text-muted"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left">Order</th>
                <th className="p-3 text-left">Category</th>
                <th className="p-3 text-left">Slug</th>
                <th className="p-3 text-left">HSN</th>
                <th className="p-3 text-left">Enabled</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-surface-2/30">
                  <td className="p-3 tabular-nums">{r.displayOrder}</td>
                  <td className="p-3">
                    <span className="mr-2">{r.emoji || r.imageUrl ? (r.emoji || "🖼️") : "📦"}</span>
                    {r.name}
                  </td>
                  <td className="p-3 font-mono text-xs text-text-muted">{r.slug}</td>
                  <td className="p-3 font-mono text-xs">{r.defaultHsn || "—"}</td>
                  <td className="p-3">{r.enabled ? "Yes" : "No"}</td>
                  <td className="p-3 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => void remove(r)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Category" : "Create Category"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name ?? ""} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Slug</Label><Input value={form.slug ?? ""} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} placeholder="auto from name if empty" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Emoji</Label><Input value={form.emoji ?? ""} onChange={(e) => setForm((p) => ({ ...p, emoji: e.target.value }))} placeholder="🔥" /></div>
              <div><Label>Display order</Label><Input type="number" value={form.displayOrder ?? 0} onChange={(e) => setForm((p) => ({ ...p, displayOrder: Number(e.target.value) || 0 }))} /></div>
            </div>
            <div><Label>Default HSN</Label><Input value={form.defaultHsn ?? ""} onChange={(e) => setForm((p) => ({ ...p, defaultHsn: e.target.value }))} /></div>
            <div>
              <Label>Icon / image</Label>
              <Input type="file" accept="image/*" onChange={onImagePick} className="mt-1" />
              {form.imageUrl && <img src={form.imageUrl} alt="" className="mt-2 h-16 w-16 rounded object-cover border border-border" />}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label>Enabled</Label>
              <Switch checked={form.enabled !== false} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
