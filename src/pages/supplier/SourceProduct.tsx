import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Star, Image as ImageIcon, ChevronLeft, ChevronRight, Save, Eye, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type StepKey = "details" | "variants" | "shipping" | "other";
const STEPS: { key: StepKey; label: string }[] = [
  { key: "details", label: "Product Details" },
  { key: "variants", label: "Variants Details" },
  { key: "shipping", label: "Shipping Details" },
  { key: "other", label: "Other Details" },
];

interface Variant {
  option1_name?: string; option1_value?: string;
  option2_name?: string; option2_value?: string;
  sku: string; price: number; stock: number; weight: string; dimensions: string; image: string; status: string;
}

const emptyForm = {
  name: "", sku: "", category: "", brand: "",
  short_description: "", long_description: "",
  status: "draft", tags: "", unit: "pcs", min_order_qty: 1,
  price: 0, selling_price: 0, stock: 0, hsn: "",
  images: [] as string[], primary_image_index: 0,
  weight: "", length_cm: "", width_cm: "", height_cm: "",
  shipping_class: "standard", pickup_location_id: "",
  cod_available: true, returnable: true, fragile: false,
  gst_percent: 18, country_of_origin: "India",
  warranty: "", manufacturer: "", care_instructions: "",
  seo_title: "", seo_description: "", internal_notes: "",
  compliance: false, terms: false,
};

const basePath = (role: string) => `/${role}/source-product`;
const productsPath = (role: string) => `/${role}/products`;

export default function SourceProduct() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get("id");
  const { role, userId, isDemoMode } = useAuth();
  const [step, setStep] = useState<StepKey>("details");
  const [form, setForm] = useState(emptyForm);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantGroups, setVariantGroups] = useState<{ name: string; values: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load existing product if editing
  useEffect(() => {
    if (!editId) return;
    (async () => {
      if (isDemoMode) {
        const stored = localStorage.getItem("supplier_products_demo");
        const list = stored ? JSON.parse(stored) : [];
        const p = list.find((x: any) => x.id === editId);
        if (p) hydrate(p);
        return;
      }
      const { data } = await supabase.from("products").select("*").eq("id", editId).single();
      if (data) hydrate(data);
      const { data: vRows } = await supabase.from("product_variants").select("*").eq("product_id", editId);
      if (vRows) setVariants(vRows.map(v => ({
        option1_name: v.option1_name || "", option1_value: v.option1_value || "",
        option2_name: v.option2_name || "", option2_value: v.option2_value || "",
        sku: v.sku || "", price: Number(v.price) || 0, stock: v.stock || 0,
        weight: v.weight || "", dimensions: v.dimensions || "", image: v.image || "", status: v.status || "active",
      })));
    })();
  }, [editId, isDemoMode]);

  const hydrate = (p: any) => {
    setForm({
      ...emptyForm,
      ...p,
      tags: Array.isArray(p.tags) ? p.tags.join(", ") : (p.tags || ""),
      images: Array.isArray(p.images) ? p.images : [],
      length_cm: p.length_cm ?? "",
      width_cm: p.width_cm ?? "",
      height_cm: p.height_cm ?? "",
    });
  };

  // Warn on unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const update = (patch: Partial<typeof form>) => { setForm(f => ({ ...f, ...patch })); setDirty(true); };

  const stepIndex = STEPS.findIndex(s => s.key === step);
  const goStep = (k: StepKey) => setStep(k);
  const next = () => stepIndex < 3 && setStep(STEPS[stepIndex + 1].key);
  const back = () => stepIndex > 0 && setStep(STEPS[stepIndex - 1].key);

  // Image handling
  const onPickImages = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).filter(f => /image\/(jpeg|png|webp|jpg)/.test(f.type) && f.size < 5 * 1024 * 1024);
    if (arr.length === 0) { toast.error("Only JPG/PNG/WEBP under 5MB"); return; }
    const readers = arr.map(f => new Promise<string>(res => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.readAsDataURL(f);
    }));
    Promise.all(readers).then(urls => update({ images: [...form.images, ...urls] }));
  };
  const removeImage = (i: number) => {
    const next = form.images.filter((_, idx) => idx !== i);
    update({ images: next, primary_image_index: Math.min(form.primary_image_index, Math.max(0, next.length - 1)) });
  };
  const setPrimary = (i: number) => update({ primary_image_index: i });
  const moveImage = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= form.images.length) return;
    const arr = [...form.images];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    update({ images: arr });
  };

  // Variant generation
  const addVariantGroup = () => setVariantGroups(g => g.length < 2 ? [...g, { name: "", values: "" }] : g);
  const removeVariantGroup = (i: number) => setVariantGroups(g => g.filter((_, idx) => idx !== i));
  const generateCombinations = () => {
    const groups = variantGroups.filter(g => g.name && g.values).map(g => ({
      name: g.name, values: g.values.split(",").map(v => v.trim()).filter(Boolean),
    }));
    if (groups.length === 0) { toast.error("Add at least one variant group"); return; }
    const combos: Variant[] = [];
    if (groups.length === 1) {
      groups[0].values.forEach(v => combos.push({
        option1_name: groups[0].name, option1_value: v,
        sku: `${form.sku || "SKU"}-${v}`, price: form.selling_price, stock: 0, weight: form.weight, dimensions: "", image: "", status: "active",
      }));
    } else {
      groups[0].values.forEach(v1 => groups[1].values.forEach(v2 => combos.push({
        option1_name: groups[0].name, option1_value: v1,
        option2_name: groups[1].name, option2_value: v2,
        sku: `${form.sku || "SKU"}-${v1}-${v2}`, price: form.selling_price, stock: 0, weight: form.weight, dimensions: "", image: "", status: "active",
      })));
    }
    setVariants(combos);
    toast.success(`Generated ${combos.length} variants`);
  };
  const addManualVariant = () => setVariants(v => [...v, {
    sku: "", price: form.selling_price, stock: 0, weight: "", dimensions: "", image: "", status: "active",
  }]);
  const updateVariant = (i: number, patch: Partial<Variant>) => setVariants(v => v.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const removeVariant = (i: number) => setVariants(v => v.filter((_, idx) => idx !== i));

  // Validation
  const validate = (forPublish: boolean) => {
    if (!form.name.trim()) { toast.error("Product name is required"); setStep("details"); return false; }
    if (!form.category) { toast.error("Category is required"); setStep("details"); return false; }
    if (forPublish && form.images.length === 0) { toast.error("At least one image is required to publish"); setStep("details"); return false; }
    if (forPublish && form.selling_price <= 0) { toast.error("Selling price required"); setStep("details"); return false; }
    if (forPublish && !form.terms) { toast.error("Please accept terms"); setStep("other"); return false; }
    return true;
  };

  // Save
  const save = async (status: "draft" | "active") => {
    if (!validate(status === "active")) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name, sku: form.sku || null, category: form.category || null, brand: form.brand || null,
        short_description: form.short_description || null, long_description: form.long_description || null,
        status, tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : null,
        unit: form.unit, min_order_qty: form.min_order_qty,
        price: form.price, selling_price: form.selling_price, stock: form.stock,
        hsn: form.hsn || null, weight: form.weight || null,
        images: form.images, primary_image_index: form.primary_image_index,
        length_cm: form.length_cm ? Number(form.length_cm) : null,
        width_cm: form.width_cm ? Number(form.width_cm) : null,
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        shipping_class: form.shipping_class, pickup_location_id: form.pickup_location_id || null,
        cod_available: form.cod_available, returnable: form.returnable, fragile: form.fragile,
        gst_percent: form.gst_percent, country_of_origin: form.country_of_origin,
        warranty: form.warranty || null, manufacturer: form.manufacturer || null,
        care_instructions: form.care_instructions || null,
        seo_title: form.seo_title || null, seo_description: form.seo_description || null,
        internal_notes: form.internal_notes || null,
        dimensions: [form.length_cm, form.width_cm, form.height_cm].filter(Boolean).join("x") || null,
        user_id: userId,
      };

      if (isDemoMode) {
        const stored = localStorage.getItem("supplier_products_demo");
        const list = stored ? JSON.parse(stored) : [];
        if (editId) {
          const i = list.findIndex((x: any) => x.id === editId);
          if (i >= 0) list[i] = { ...list[i], ...payload, id: editId };
        } else {
          list.unshift({ ...payload, id: `demo-${Date.now()}`, created_at: new Date().toISOString() });
        }
        localStorage.setItem("supplier_products_demo", JSON.stringify(list));
        toast.success(status === "active" ? "Product published (demo)" : "Saved as draft (demo)");
      } else {
        let pid = editId;
        if (editId) {
          const { error } = await supabase.from("products").update(payload).eq("id", editId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from("products").insert(payload).select().single();
          if (error) throw error;
          pid = data.id;
        }
        if (pid && variants.length) {
          await supabase.from("product_variants").delete().eq("product_id", pid);
          await supabase.from("product_variants").insert(variants.map(v => ({
            product_id: pid, user_id: userId,
            option1_name: v.option1_name || null, option1_value: v.option1_value || null,
            option2_name: v.option2_name || null, option2_value: v.option2_value || null,
            sku: v.sku || null, price: v.price, stock: v.stock,
            weight: v.weight || null, dimensions: v.dimensions || null, image: v.image || null, status: v.status,
          })));
        }
        toast.success(status === "active" ? "Product published" : "Saved as draft");
      }
      setDirty(false);
      navigate(productsPath(role));
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in-up max-w-6xl mx-auto">
      <PageHeader
        title={editId ? "Edit Product" : "Add New Product"}
        breadcrumb={[role.charAt(0).toUpperCase() + role.slice(1), "Products", "Add Product"]}
      />

      {/* Stepper */}
      <div className="rounded-xl bg-card shadow-card p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Fill in the details to list your product</h2>
            <p className="text-xs text-text-muted mt-0.5">Complete all 4 steps and publish</p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <div className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold",
                  i === stepIndex ? "bg-warning text-warning-foreground" :
                  i < stepIndex ? "bg-success text-white" : "bg-surface-2 text-text-muted"
                )}>{i + 1}</div>
                {i < 3 && <div className={cn("h-px w-6", i < stepIndex ? "bg-success" : "bg-border")} />}
              </div>
            ))}
          </div>
        </div>

        <Tabs value={step} onValueChange={v => goStep(v as StepKey)}>
          <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full bg-surface-2">
            {STEPS.map(s => (
              <TabsTrigger key={s.key} value={s.key} className="text-xs data-[state=active]:bg-warning data-[state=active]:text-warning-foreground">
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Step content */}
      <div className="rounded-xl bg-card shadow-card p-5 mb-4 space-y-5">
        {step === "details" && (
          <>
            <h3 className="font-semibold text-text-primary border-b border-border pb-2">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Product Category *</Label>
                <Select value={form.category} onValueChange={v => update({ category: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {["Apparel","Electronics","Home & Kitchen","Beauty","Sports","Toys","Books","Automotive","Arts & Entertainment"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Product Name *</Label><Input value={form.name} onChange={e => update({ name: e.target.value })} placeholder="e.g. Cotton T-Shirt" /></div>
              <div><Label>Product Main SKU</Label><Input value={form.sku} onChange={e => update({ sku: e.target.value })} placeholder="SKU-001" /></div>
              <div><Label>Brand</Label><Input value={form.brand} onChange={e => update({ brand: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => update({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["draft","active","inactive"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Tags (comma separated)</Label><Input value={form.tags} onChange={e => update({ tags: e.target.value })} placeholder="cotton, casual" /></div>
              <div><Label>Unit</Label><Input value={form.unit} onChange={e => update({ unit: e.target.value })} placeholder="pcs / kg" /></div>
              <div><Label>Min Order Qty</Label><Input type="number" value={form.min_order_qty} onChange={e => update({ min_order_qty: Number(e.target.value) || 1 })} /></div>
              <div><Label>Price (₹)</Label><Input type="number" value={form.price} onChange={e => update({ price: Number(e.target.value) || 0 })} /></div>
              <div><Label>Selling Price (₹) *</Label><Input type="number" value={form.selling_price} onChange={e => update({ selling_price: Number(e.target.value) || 0 })} /></div>
              <div><Label>Stock</Label><Input type="number" value={form.stock} onChange={e => update({ stock: Number(e.target.value) || 0 })} /></div>
            </div>
            <div><Label>Short Description</Label><Textarea rows={2} value={form.short_description} onChange={e => update({ short_description: e.target.value })} /></div>
            <div><Label>Long Description</Label><Textarea rows={5} value={form.long_description} onChange={e => update({ long_description: e.target.value })} /></div>

            <h3 className="font-semibold text-text-primary border-b border-border pb-2 pt-2">Image Gallery *</h3>
            <label className="block border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-warning transition-colors">
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => onPickImages(e.target.files)} />
              <ImageIcon className="h-8 w-8 mx-auto text-text-muted mb-2" />
              <p className="text-sm font-medium text-text-primary">Click to upload images</p>
              <p className="text-xs text-text-muted mt-1">PNG, JPG, WEBP — max 5MB each</p>
            </label>
            {form.images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {form.images.map((img, i) => (
                  <div key={i} className={cn("group relative rounded-lg overflow-hidden border-2", form.primary_image_index === i ? "border-warning" : "border-border")}>
                    <img src={img} alt="" className="aspect-square w-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <button onClick={() => setPrimary(i)} title="Set primary" className="p-1.5 rounded bg-white/90 hover:bg-white"><Star className={cn("h-3 w-3", form.primary_image_index === i ? "fill-warning text-warning" : "text-text-secondary")} /></button>
                      <button onClick={() => moveImage(i, -1)} title="Move left" className="p-1.5 rounded bg-white/90 hover:bg-white"><ChevronLeft className="h-3 w-3" /></button>
                      <button onClick={() => moveImage(i, 1)} title="Move right" className="p-1.5 rounded bg-white/90 hover:bg-white"><ChevronRight className="h-3 w-3" /></button>
                      <button onClick={() => removeImage(i)} title="Remove" className="p-1.5 rounded bg-danger text-white"><X className="h-3 w-3" /></button>
                    </div>
                    {form.primary_image_index === i && <span className="absolute top-1 left-1 bg-warning text-warning-foreground text-[9px] font-bold uppercase px-1.5 py-0.5 rounded">Primary</span>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {step === "variants" && (
          <>
            <h3 className="font-semibold text-text-primary border-b border-border pb-2">Variant Groups</h3>
            <p className="text-xs text-text-muted">Define option groups (e.g. Color, Size) and generate combinations.</p>
            {variantGroups.map((g, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-3 items-end p-3 rounded-lg bg-surface-2">
                <div><Label>Option Name</Label><Input value={g.name} onChange={e => setVariantGroups(arr => arr.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} placeholder="Color" /></div>
                <div><Label>Values (comma)</Label><Input value={g.values} onChange={e => setVariantGroups(arr => arr.map((x, idx) => idx === i ? { ...x, values: e.target.value } : x))} placeholder="Red, Blue, Green" /></div>
                <Button variant="outline" size="icon" onClick={() => removeVariantGroup(i)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" onClick={addVariantGroup} disabled={variantGroups.length >= 2}><Plus className="h-4 w-4 mr-1" />Add Group</Button>
              <Button onClick={generateCombinations} className="bg-warning text-warning-foreground hover:bg-warning/90">Generate Combinations</Button>
              <Button variant="outline" onClick={addManualVariant}>Manual Variant</Button>
            </div>
            {variants.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2 text-text-muted uppercase tracking-wide">
                    <tr>
                      <th className="px-2 py-2 text-left">Variant</th><th className="px-2 py-2 text-left">SKU</th>
                      <th className="px-2 py-2 text-left">Price</th><th className="px-2 py-2 text-left">Stock</th>
                      <th className="px-2 py-2 text-left">Weight</th><th className="px-2 py-2 text-left">Dim.</th>
                      <th className="px-2 py-2 text-left">Status</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1 whitespace-nowrap">{[v.option1_value, v.option2_value].filter(Boolean).join(" / ") || "—"}</td>
                        <td className="px-2 py-1"><Input className="h-7 text-xs" value={v.sku} onChange={e => updateVariant(i, { sku: e.target.value })} /></td>
                        <td className="px-2 py-1"><Input className="h-7 text-xs w-20" type="number" value={v.price} onChange={e => updateVariant(i, { price: Number(e.target.value) || 0 })} /></td>
                        <td className="px-2 py-1"><Input className="h-7 text-xs w-16" type="number" value={v.stock} onChange={e => updateVariant(i, { stock: Number(e.target.value) || 0 })} /></td>
                        <td className="px-2 py-1"><Input className="h-7 text-xs w-20" value={v.weight} onChange={e => updateVariant(i, { weight: e.target.value })} /></td>
                        <td className="px-2 py-1"><Input className="h-7 text-xs w-24" value={v.dimensions} onChange={e => updateVariant(i, { dimensions: e.target.value })} /></td>
                        <td className="px-2 py-1">
                          <Select value={v.status} onValueChange={s => updateVariant(i, { status: s })}>
                            <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeVariant(i)}><Trash2 className="h-3 w-3 text-danger" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {step === "shipping" && (
          <>
            <h3 className="font-semibold text-text-primary border-b border-border pb-2">Shipping Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><Label>Weight (kg)</Label><Input value={form.weight} onChange={e => update({ weight: e.target.value })} placeholder="0.5" /></div>
              <div><Label>Length (cm)</Label><Input type="number" value={form.length_cm} onChange={e => update({ length_cm: e.target.value as any })} /></div>
              <div><Label>Width (cm)</Label><Input type="number" value={form.width_cm} onChange={e => update({ width_cm: e.target.value as any })} /></div>
              <div><Label>Height (cm)</Label><Input type="number" value={form.height_cm} onChange={e => update({ height_cm: e.target.value as any })} /></div>
              <div>
                <Label>Shipping Class</Label>
                <Select value={form.shipping_class} onValueChange={v => update({ shipping_class: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem><SelectItem value="express">Express</SelectItem>
                    <SelectItem value="heavy">Heavy</SelectItem><SelectItem value="oversize">Oversize</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Pickup Location</Label><Input value={form.pickup_location_id} onChange={e => update({ pickup_location_id: e.target.value })} placeholder="Address ID / label" /></div>
              <div><Label>HSN Code</Label><Input value={form.hsn} onChange={e => update({ hsn: e.target.value })} /></div>
              <div><Label>GST %</Label><Input type="number" value={form.gst_percent} onChange={e => update({ gst_percent: Number(e.target.value) || 0 })} /></div>
              <div><Label>Country of Origin</Label><Input value={form.country_of_origin} onChange={e => update({ country_of_origin: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-sm">COD Available</span><Switch checked={form.cod_available} onCheckedChange={v => update({ cod_available: v })} /></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-sm">Returnable</span><Switch checked={form.returnable} onCheckedChange={v => update({ returnable: v })} /></div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-sm">Fragile</span><Switch checked={form.fragile} onCheckedChange={v => update({ fragile: v })} /></div>
            </div>
          </>
        )}

        {step === "other" && (
          <>
            <h3 className="font-semibold text-text-primary border-b border-border pb-2">Other Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Warranty</Label><Input value={form.warranty} onChange={e => update({ warranty: e.target.value })} placeholder="6 months" /></div>
              <div><Label>Manufacturer</Label><Input value={form.manufacturer} onChange={e => update({ manufacturer: e.target.value })} /></div>
            </div>
            <div><Label>Care Instructions</Label><Textarea rows={2} value={form.care_instructions} onChange={e => update({ care_instructions: e.target.value })} /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>SEO Title</Label><Input value={form.seo_title} onChange={e => update({ seo_title: e.target.value })} /></div>
              <div><Label>SEO Description</Label><Input value={form.seo_description} onChange={e => update({ seo_description: e.target.value })} /></div>
            </div>
            <div><Label>Internal Notes</Label><Textarea rows={2} value={form.internal_notes} onChange={e => update({ internal_notes: e.target.value })} /></div>
            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.compliance} onChange={e => update({ compliance: e.target.checked })} />I confirm this product complies with all applicable regulations.</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.terms} onChange={e => update({ terms: e.target.checked })} />I accept the supplier terms & conditions.</label>
            </div>
          </>
        )}
      </div>

      {/* Sticky actions */}
      <div className="rounded-xl bg-card shadow-card p-4 flex flex-wrap gap-2 items-center justify-between">
        <Button variant="outline" onClick={back} disabled={stepIndex === 0}><ChevronLeft className="h-4 w-4 mr-1" />Back</Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => save("draft")} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Save as Draft
          </Button>
          {stepIndex < 3 ? (
            <Button onClick={next} className="bg-warning text-warning-foreground hover:bg-warning/90">Next Step<ChevronRight className="h-4 w-4 ml-1" /></Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => toast.info("Preview coming soon")}><Eye className="h-4 w-4 mr-1" />Preview</Button>
              <Button onClick={() => save("active")} disabled={saving} className="bg-warning text-warning-foreground hover:bg-warning/90">
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Publish Product
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
