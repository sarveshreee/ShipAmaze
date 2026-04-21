import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const TEMPLATE_HEADERS = [
  "name","sku","category","brand","short_description","long_description",
  "status","tags","unit","min_order_qty","price","selling_price","stock",
  "hsn","weight","length_cm","width_cm","height_cm","shipping_class",
  "cod_available","returnable","fragile","gst_percent","country_of_origin",
  "warranty","manufacturer","care_instructions","seo_title","seo_description","image_urls"
];

const SAMPLE_ROWS = [
  ["Cotton T-Shirt","TSHIRT-001","Apparel","ShipFlow","Soft cotton tee","100% combed cotton, pre-shrunk","active","cotton,casual,unisex","pcs","1","499","399","100","6109","0.25","30","25","2","standard","true","true","false","5","India","NA","Self","Machine wash cold","Cotton T-Shirt | ShipFlow","Premium cotton tees online","https://example.com/img1.jpg|https://example.com/img2.jpg"],
  ["Wireless Earbuds","EAR-002","Electronics","SoundX","Bluetooth 5.3 earbuds","ENC mic, 24h playtime, IPX5","draft","audio,wireless","pcs","1","2999","1799","50","8518","0.18","12","8","4","standard","true","true","true","18","India","1 year","SoundX Pvt Ltd","Keep dry","Wireless Earbuds | SoundX","Best earbuds under 2000",""],
];

// Tiny CSV parser supporting quoted fields and embedded commas
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(v => v && v.trim() !== ""));
}

const toBool = (v: string) => /^(true|1|yes|y)$/i.test((v || "").trim());
const toNum = (v: string) => { const n = Number((v || "").trim()); return isNaN(n) ? 0 : n; };

interface ParsedRow {
  raw: Record<string, string>;
  errors: string[];
  payload?: any;
}

export default function BulkUploadProducts() {
  const navigate = useNavigate();
  const { role, userId, userName, isDemoMode } = useAuth();

  // Block dropshippers
  useEffect(() => {
    if (role === "dropshipper") {
      toast.error("Dropshippers cannot upload products");
      navigate(`/${role}/products`, { replace: true });
    }
  }, [role, navigate]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number } | null>(null);

  const downloadTemplate = () => {
    const csv = [TEMPLATE_HEADERS.join(","), ...SAMPLE_ROWS.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "products_template.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded");
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setResult(null);
    const text = await file.text();
    const matrix = parseCSV(text);
    if (matrix.length < 2) { toast.error("CSV needs a header row and at least one data row"); return; }
    const header = matrix[0].map(h => h.trim().toLowerCase());
    const parsed: ParsedRow[] = matrix.slice(1).map((r) => {
      const raw: Record<string, string> = {};
      header.forEach((h, i) => raw[h] = (r[i] || "").trim());
      const errors: string[] = [];
      if (!raw.name) errors.push("name required");
      if (!raw.category) errors.push("category required");
      const sp = toNum(raw.selling_price);
      if (sp <= 0) errors.push("selling_price > 0");
      const status = (raw.status || "draft").toLowerCase();
      if (!["draft","active","inactive","pending"].includes(status)) errors.push("status invalid");

      const payload = {
        name: raw.name, sku: raw.sku || null, category: raw.category || null, brand: raw.brand || null,
        short_description: raw.short_description || null, long_description: raw.long_description || null,
        status,
        tags: raw.tags ? raw.tags.split(/[,|]/).map(t => t.trim()).filter(Boolean) : null,
        unit: raw.unit || "pcs",
        min_order_qty: Math.max(1, toNum(raw.min_order_qty) || 1),
        price: toNum(raw.price), selling_price: sp, stock: toNum(raw.stock),
        hsn: raw.hsn || null, weight: raw.weight || null,
        length_cm: raw.length_cm ? toNum(raw.length_cm) : null,
        width_cm: raw.width_cm ? toNum(raw.width_cm) : null,
        height_cm: raw.height_cm ? toNum(raw.height_cm) : null,
        shipping_class: raw.shipping_class || "standard",
        cod_available: raw.cod_available === "" ? true : toBool(raw.cod_available),
        returnable: raw.returnable === "" ? true : toBool(raw.returnable),
        fragile: toBool(raw.fragile),
        gst_percent: raw.gst_percent ? toNum(raw.gst_percent) : 18,
        country_of_origin: raw.country_of_origin || "India",
        warranty: raw.warranty || null, manufacturer: raw.manufacturer || null,
        care_instructions: raw.care_instructions || null,
        seo_title: raw.seo_title || null, seo_description: raw.seo_description || null,
        images: raw.image_urls ? raw.image_urls.split(/[|;]/).map(u => u.trim()).filter(Boolean) : [],
        primary_image_index: 0,
        dimensions: [raw.length_cm, raw.width_cm, raw.height_cm].filter(Boolean).join("x") || null,
        user_id: userId,
      };
      return { raw, errors, payload };
    });
    setRows(parsed);
    const validCount = parsed.filter(r => r.errors.length === 0).length;
    toast.success(`Parsed ${parsed.length} rows • ${validCount} valid`);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const importAll = async () => {
    const valid = rows.filter(r => r.errors.length === 0);
    if (valid.length === 0) { toast.error("No valid rows to import"); return; }
    setImporting(true);
    let ok = 0, fail = 0;
    try {
      if (isDemoMode || !userId) {
        const stored = localStorage.getItem("supplier_products_demo");
        const list = stored ? JSON.parse(stored) : [];
        valid.forEach(r => {
          list.unshift({ ...r.payload, id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, created_at: new Date().toISOString() });
          ok++;
        });
        localStorage.setItem("supplier_products_demo", JSON.stringify(list));
      } else {
        // Insert in chunks of 100
        const chunks: any[][] = [];
        for (let i = 0; i < valid.length; i += 100) chunks.push(valid.slice(i, i + 100).map(v => v.payload));
        for (const chunk of chunks) {
          const { error, data } = await supabase.from("products").insert(chunk).select("id");
          if (error) { fail += chunk.length; toast.error(error.message); }
          else ok += data?.length || chunk.length;
        }
      }
      setResult({ ok, fail });
      toast.success(`Imported ${ok} products${fail ? `, ${fail} failed` : ""}`);
    } finally {
      setImporting(false);
    }
  };

  const validCount = rows.filter(r => r.errors.length === 0).length;
  const invalidCount = rows.length - validCount;

  return (
    <div className="animate-fade-in-up max-w-6xl mx-auto">
      <PageHeader
        title="Bulk Upload Products"
        breadcrumb={[role.charAt(0).toUpperCase() + role.slice(1), "Products", "Bulk Upload"]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate}><Download className="h-4 w-4 mr-2" />Download Template</Button>
            <Button variant="outline" onClick={() => navigate(`/${role}/products`)}>View Products</Button>
          </div>
        }
      />

      <div className="rounded-xl bg-card shadow-card p-5 mb-4">
        <h3 className="font-semibold text-text-primary mb-2">How it works</h3>
        <ol className="text-sm text-text-muted space-y-1 list-decimal pl-5">
          <li>Download the CSV template above and fill in your products.</li>
          <li>Required columns: <span className="font-mono text-text-primary">name</span>, <span className="font-mono text-text-primary">category</span>, <span className="font-mono text-text-primary">selling_price</span>.</li>
          <li>For multiple <span className="font-mono">image_urls</span> or <span className="font-mono">tags</span>, separate with <span className="font-mono">|</span> or <span className="font-mono">,</span>.</li>
          <li>Upload, review the preview, fix any errors, then click <b>Import All</b>.</li>
        </ol>
      </div>

      <div
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        className="rounded-xl border-2 border-dashed border-border bg-card p-10 text-center mb-4 hover:border-warning transition-colors"
      >
        <FileSpreadsheet className="h-10 w-10 mx-auto text-text-muted mb-3" />
        <p className="font-medium text-text-primary">Drop your CSV here, or</p>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <Button className="bg-warning text-warning-foreground hover:bg-warning/90 mt-3" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4 mr-2" />Choose CSV File
        </Button>
        {fileName && <p className="text-xs text-text-muted mt-3">Loaded: <span className="font-mono">{fileName}</span></p>}
      </div>

      {rows.length > 0 && (
        <>
          <div className="rounded-xl bg-card shadow-card p-4 mb-4 flex flex-wrap items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-surface-2 text-text-secondary">{rows.length} TOTAL</span>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-success-light text-success-dark">{validCount} VALID</span>
            {invalidCount > 0 && <span className="px-3 py-1 rounded-full text-xs font-bold bg-danger-light text-danger-dark">{invalidCount} INVALID</span>}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => { setRows([]); setFileName(""); setResult(null); }}><Trash2 className="h-4 w-4 mr-2" />Clear</Button>
              <Button className="bg-warning text-warning-foreground hover:bg-warning/90" disabled={importing || validCount === 0} onClick={importAll}>
                {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Import {validCount} Product{validCount !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>

          {result && (
            <div className="rounded-xl bg-success-light text-success-dark p-4 mb-4 flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-5 w-5" /> Imported {result.ok} products{result.fail ? `, ${result.fail} failed` : ""}.
              <Button size="sm" className="ml-auto bg-success text-white hover:bg-success/90" onClick={() => navigate(`/${role}/products`)}>Go to Products</Button>
            </div>
          )}

          <div className="rounded-xl bg-card shadow-card overflow-hidden">
            <div className="overflow-x-auto max-h-[60vh]">
              <table className="w-full text-xs">
                <thead className="bg-surface-2 text-text-muted uppercase tracking-wide sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2 text-left">SKU</th>
                    <th className="px-2 py-2 text-left">Category</th>
                    <th className="px-2 py-2 text-left">Price</th>
                    <th className="px-2 py-2 text-left">Stock</th>
                    <th className="px-2 py-2 text-left">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={cn("border-t border-border", r.errors.length > 0 ? "bg-danger-light/30" : "hover:bg-surface-2/40")}>
                      <td className="px-2 py-1.5 text-text-muted">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        {r.errors.length === 0
                          ? <CheckCircle2 className="h-4 w-4 text-success" />
                          : <AlertCircle className="h-4 w-4 text-danger" />}
                      </td>
                      <td className="px-2 py-1.5 max-w-[200px] truncate" title={r.raw.name}>{r.raw.name || "—"}</td>
                      <td className="px-2 py-1.5 font-mono">{r.raw.sku || "—"}</td>
                      <td className="px-2 py-1.5">{r.raw.category || "—"}</td>
                      <td className="px-2 py-1.5">₹{r.raw.selling_price || 0}</td>
                      <td className="px-2 py-1.5">{r.raw.stock || 0}</td>
                      <td className="px-2 py-1.5 text-danger text-[11px]">{r.errors.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
