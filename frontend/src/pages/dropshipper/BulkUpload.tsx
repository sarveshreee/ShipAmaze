import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  FileSpreadsheet,
  X,
  AlertTriangle,
  Copy,
  ArrowLeft,
  ArrowRight,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Papa from "papaparse";
import * as orderService from "@/services/orderService";

const steps = ["Upload", "Validate", "Review", "Confirm"] as const;

interface ParsedRow {
  row: number;
  valid: boolean;
  duplicate: boolean;
  name: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
  weight: string;
  payment: string;
  amount: string;
  product: string;
  error: string;
}

const TEMPLATE_HEADERS = [
  "Customer Name",
  "Phone",
  "Address",
  "City",
  "Pincode",
  "Weight (kg)",
  "Payment (COD/Prepaid)",
  "Amount",
  "Product Name",
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function rowKey(r: Pick<ParsedRow, "phone" | "pincode" | "name">) {
  return `${r.phone}|${r.pincode}|${r.name}`.toLowerCase();
}

export default function BulkUpload() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validRows = rows.filter((r) => r.valid && !r.duplicate);
  const errorRows = rows.filter((r) => !r.valid);
  const duplicateRows = rows.filter((r) => r.duplicate);

  const downloadTemplate = () => {
    const csv = [
      TEMPLATE_HEADERS.join(","),
      '"Amit Sharma","+91 9800000010","123 MG Road","Mumbai","400001","0.5","Prepaid","499","Cotton T-Shirt"',
      '"Priya Patel","+91 9800000020","456 Park Street","Delhi","110001","1.0","COD","899","Leather Wallet"',
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk_upload_template.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded");
  };

  const parseRows = useCallback((data: Record<string, unknown>[]) => {
    const seen = new Map<string, number>();
    const parsed: ParsedRow[] = data.map((row, i) => {
      const name = String(row["Customer Name"] || row["customer_name"] || row["name"] || "").trim();
      const phone = String(row["Phone"] || row["phone"] || "").trim();
      const address = String(row["Address"] || row["address"] || "").trim();
      const city = String(row["City"] || row["city"] || "").trim();
      const pincode = String(row["Pincode"] || row["pincode"] || "").trim();
      const weight = String(row["Weight (kg)"] || row["weight"] || "0.5").trim();
      const payment = String(row["Payment (COD/Prepaid)"] || row["payment"] || "Prepaid").trim();
      const amount = String(row["Amount"] || row["amount"] || "0").trim();
      const product = String(row["Product Name"] || row["product"] || "").trim();

      const errors: string[] = [];
      if (!name) errors.push("Name required");
      if (!phone) errors.push("Phone required");
      if (!pincode || pincode.length !== 6) errors.push("Invalid pincode");
      if (!city) errors.push("City required");

      const key = rowKey({ phone, pincode, name });
      let duplicate = false;
      if (key.replace(/\|/g, "").length > 0) {
        if (seen.has(key)) duplicate = true;
        else seen.set(key, i + 1);
      }

      return {
        row: i + 1,
        valid: errors.length === 0 && !duplicate,
        duplicate,
        name,
        phone,
        address,
        city,
        pincode,
        weight,
        payment,
        amount,
        product,
        error: duplicate ? "Duplicate row" : errors.join("; "),
      };
    });
    return parsed;
  }, []);

  const handleFile = (file: File) => {
    setParsing(true);
    setSelectedFile(file);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const parsed = parseRows(result.data as Record<string, unknown>[]);
        if (parsed.length === 0) {
          toast.error("No rows found in file");
          setParsing(false);
          return;
        }
        setRows(parsed);
        setStep(1);
        setParsing(false);
        toast.success(`Parsed ${parsed.length} rows`, {
          description: `${parsed.filter((r) => r.valid).length} valid · ${parsed.filter((r) => !r.valid && !r.duplicate).length} errors · ${parsed.filter((r) => r.duplicate).length} duplicates`,
        });
      },
      error: (err) => {
        setParsing(false);
        toast.error("Failed to parse file", { description: err.message });
      },
    });
  };

  const clearFile = () => {
    setSelectedFile(null);
    setRows([]);
    setStep(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleProcess = async () => {
    setProcessing(true);
    setStep(3);
    try {
      const today = new Date().toISOString().split("T")[0];
      const newOrders = validRows.map((r, i) => ({
        customer: r.name,
        phone: r.phone,
        address: r.address,
        city: r.city,
        pincode: r.pincode,
        weight: `${r.weight} kg`,
        courier: "Delhivery",
        payment: (r.payment === "COD" ? "COD" : "Prepaid") as "COD" | "Prepaid",
        status: "pending",
        date: today,
        awb: `AWB${Date.now().toString().slice(-7)}${i}`,
        amount: parseFloat(r.amount) || 0,
        products: r.product
          ? [{ name: r.product, qty: 1, price: parseFloat(r.amount) || 0, weight: r.weight }]
          : [],
        dimensions: "",
        zone: "B",
        pickupAddress: "",
      }));

      const res = await orderService.createOrdersBulk(newOrders);
      setProcessedCount(res.created ?? newOrders.length);
      toast.success(`${res.created ?? newOrders.length} orders created successfully!`);
    } catch (err: unknown) {
      toast.error("Failed to process orders", {
        description: err instanceof Error ? err.message : "Error",
      });
      setStep(2);
    } finally {
      setProcessing(false);
    }
  };

  const estimatedCost = validRows.length * 45;

  return (
    <div className="animate-fade-in-up mx-auto max-w-5xl space-y-6 overflow-x-hidden">
      <PageHeader title="Bulk Upload" breadcrumb={["Dropshipper", "Bulk Upload"]} />

      {/* Step progress */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 sm:gap-0 sm:justify-between">
          {steps.map((s, i) => (
            <div key={s} className="flex flex-1 min-w-[72px] items-center gap-2 sm:min-w-0">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  i < step && "bg-indigo-600 text-white",
                  i === step && "bg-indigo-600 text-white ring-4 ring-indigo-500/20",
                  i > step && "bg-surface-2 text-text-muted",
                )}
              >
                {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "hidden text-sm font-medium sm:inline",
                  i <= step ? "text-text-primary" : "text-text-muted",
                )}
              >
                {s}
              </span>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "mx-2 hidden h-0.5 flex-1 sm:block",
                    i < step ? "bg-indigo-600" : "bg-border",
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 0: Upload */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Upload order spreadsheet</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Import multiple orders at once using our CSV template. Drag and drop or browse to select a file.
                </p>
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />

            {!selectedFile ? (
              <div
                className={cn(
                  "cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors sm:p-14",
                  dragOver
                    ? "border-indigo-500 bg-indigo-500/5"
                    : "border-border hover:border-indigo-400/60 hover:bg-surface-2/50",
                )}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <Upload className="mx-auto mb-4 h-12 w-12 text-text-muted" />
                <p className="font-medium text-text-primary">Drag & drop your CSV file here</p>
                <p className="mt-1 text-sm text-text-muted">or click to browse · .csv recommended</p>
                <p className="mt-4 text-xs text-text-muted">
                  Required columns: Customer Name, Phone, Address, City, Pincode, Weight, Payment, Amount, Product Name
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface-2/40 p-4">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-10 w-10 shrink-0 text-indigo-600 dark:text-indigo-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text-primary">{selectedFile.name}</p>
                    <p className="text-sm text-text-muted">{formatFileSize(selectedFile.size)}</p>
                  </div>
                  {parsing ? (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-indigo-600" />
                  ) : (
                    <button
                      type="button"
                      onClick={clearFile}
                      className="rounded-lg p-2 text-text-muted hover:bg-surface-2 hover:text-text-primary"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => fileRef.current?.click()}
                disabled={parsing}
              >
                {parsing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload File
              </Button>
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-border bg-surface-2/30 p-6 text-center">
            <Package className="mx-auto mb-3 h-8 w-8 text-text-muted" />
            <p className="text-sm font-medium text-text-primary">No file uploaded yet</p>
            <p className="mt-1 text-xs text-text-muted">
              Download the sample CSV, fill in your orders, then upload to validate before confirming.
            </p>
          </div>
        </div>
      )}

      {/* Step 1: Validate */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total rows", value: rows.length, icon: FileSpreadsheet, tone: "text-text-primary" },
              { label: "Valid rows", value: validRows.length, icon: CheckCircle2, tone: "text-success" },
              { label: "Error rows", value: errorRows.length, icon: XCircle, tone: "text-danger" },
              { label: "Duplicates", value: duplicateRows.length, icon: Copy, tone: "text-warning" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <stat.icon className={cn("mb-2 h-5 w-5", stat.tone)} />
                <p className="text-2xl font-bold text-text-primary">{stat.value}</p>
                <p className="text-xs text-text-muted">{stat.label}</p>
              </div>
            ))}
          </div>

          {errorRows.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
                <h3 className="font-semibold text-text-primary">Rows with errors</h3>
                <span className="text-sm text-text-muted">{errorRows.length} issues</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/50">
                      <th className="p-3 text-left font-medium text-text-muted">Row</th>
                      <th className="p-3 text-left font-medium text-text-muted">Name</th>
                      <th className="p-3 text-left font-medium text-text-muted">Phone</th>
                      <th className="p-3 text-left font-medium text-text-muted">Pincode</th>
                      <th className="p-3 text-left font-medium text-text-muted">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorRows.map((r) => (
                      <tr key={r.row} className="border-b border-border last:border-0 bg-danger-light/20">
                        <td className="p-3 text-text-primary">{r.row}</td>
                        <td className="p-3">{r.name || "—"}</td>
                        <td className="p-3">{r.phone || "—"}</td>
                        <td className="p-3">{r.pincode || "—"}</td>
                        <td className="p-3 text-xs text-danger">{r.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
              <p className="font-medium text-text-primary">All rows passed validation</p>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => setStep(2)}
              disabled={validRows.length === 0}
            >
              Proceed with {validRows.length} orders
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setStep(0)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button variant="ghost" onClick={clearFile}>
              Re-upload
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Review */}
      {step === 2 && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="mx-auto max-w-md text-center">
            <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-success" />
            <h3 className="text-xl font-semibold text-text-primary">Review your upload</h3>
            <p className="mt-2 text-sm text-text-secondary">
              You are about to create <strong className="text-text-primary">{validRows.length}</strong> orders.
            </p>
            <div className="mt-6 space-y-2 rounded-xl border border-border bg-surface-2/40 p-4 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Valid orders</span>
                <span className="font-medium text-text-primary">{validRows.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Skipped (errors / duplicates)</span>
                <span className="font-medium text-text-primary">{rows.length - validRows.length}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-text-muted">Estimated shipping cost</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">₹ {estimatedCost}</span>
              </div>
            </div>
            {errorRows.length + duplicateRows.length > 0 && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {errorRows.length + duplicateRows.length} row(s) will not be imported.
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={handleProcess}
                disabled={processing}
              >
                {processing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Confirm Upload
              </Button>
              <Button variant="outline" onClick={() => setStep(1)} disabled={processing}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Confirm / Complete */}
      {step === 3 && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10">
          <div className="mx-auto max-w-md text-center">
            {processing ? (
              <>
                <Loader2 className="mx-auto mb-4 h-14 w-14 animate-spin text-indigo-600" />
                <h3 className="text-xl font-semibold text-text-primary">Creating orders…</h3>
                <p className="mt-2 text-sm text-text-muted">Please wait while we process your upload.</p>
              </>
            ) : (
              <>
                <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-success" />
                <h3 className="text-xl font-semibold text-text-primary">Upload complete</h3>
                <p className="mt-2 text-sm text-text-secondary">
                  {processedCount} order{processedCount !== 1 ? "s" : ""} created successfully.
                </p>
                <Button
                  className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={() => navigate("/dropshipper/orders")}
                >
                  View Orders
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
