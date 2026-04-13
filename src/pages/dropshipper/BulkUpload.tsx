import { useState, useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Upload, Download, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import Papa from "papaparse";

const steps = ["Upload", "Validate", "Review", "Confirm"];

interface ParsedRow {
  row: number;
  valid: boolean;
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

const TEMPLATE_HEADERS = ["Customer Name", "Phone", "Address", "City", "Pincode", "Weight (kg)", "Payment (COD/Prepaid)", "Amount", "Product Name"];

export default function BulkUpload() {
  const { userId } = useAuth();
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const validRows = rows.filter(r => r.valid);
  const errorRows = rows.filter(r => !r.valid);

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
  };

  const handleFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const parsed: ParsedRow[] = result.data.map((row: any, i: number) => {
          const name = (row["Customer Name"] || row["customer_name"] || row["name"] || "").trim();
          const phone = (row["Phone"] || row["phone"] || "").trim();
          const address = (row["Address"] || row["address"] || "").trim();
          const city = (row["City"] || row["city"] || "").trim();
          const pincode = (row["Pincode"] || row["pincode"] || "").trim();
          const weight = (row["Weight (kg)"] || row["weight"] || "0.5").trim();
          const payment = (row["Payment (COD/Prepaid)"] || row["payment"] || "Prepaid").trim();
          const amount = (row["Amount"] || row["amount"] || "0").trim();
          const product = (row["Product Name"] || row["product"] || "").trim();

          const errors: string[] = [];
          if (!name) errors.push("Name required");
          if (!phone) errors.push("Phone required");
          if (!pincode || pincode.length !== 6) errors.push("Invalid pincode");
          if (!city) errors.push("City required");

          return {
            row: i + 1,
            valid: errors.length === 0,
            name, phone, address, city, pincode, weight, payment, amount, product,
            error: errors.join("; "),
          };
        });
        setRows(parsed);
        setStep(1);
        toast.success(`Parsed ${parsed.length} rows: ${parsed.filter(r => r.valid).length} valid, ${parsed.filter(r => !r.valid).length} errors`);
      },
      error: (err) => {
        toast.error("Failed to parse file", { description: err.message });
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleProcess = async () => {
    setProcessing(true);
    setStep(3);
    try {
      const orders = validRows.map((r, i) => ({
        order_id: `BLK${Date.now().toString().slice(-5)}${i}`,
        customer: r.name,
        phone: r.phone,
        address: r.address,
        city: r.city,
        pincode: r.pincode,
        weight: `${r.weight} kg`,
        courier: "Delhivery",
        payment: r.payment === "COD" ? "COD" : "Prepaid",
        status: "pending",
        date: new Date().toISOString().split("T")[0],
        awb: `AWB${Date.now().toString().slice(-7)}${i}`,
        amount: parseFloat(r.amount) || 0,
        products: r.product ? [{ name: r.product, qty: 1, price: parseFloat(r.amount) || 0, weight: r.weight }] : [],
        user_id: userId || null,
      }));

      const { error } = await supabase.from("orders").insert(orders);
      if (error) throw error;
      setProcessedCount(orders.length);
      toast.success(`${orders.length} orders created successfully!`);
        const { error } = await supabase.from("orders").insert(orders);
        if (error) throw error;
        setProcessedCount(orders.length);
        toast.success(`${orders.length} orders created successfully!`);
      }
    } catch (err: any) {
      toast.error("Failed to process orders", { description: err.message });
      setStep(2);
    } finally {
      setProcessing(false);
    }
  };

  const estimatedCost = validRows.length * 45;

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Bulk Upload" breadcrumb={["Dropshipper", "Bulk Upload"]} />

      <div className="flex items-center gap-2 mb-6">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium",
              i <= step ? "bg-primary text-primary-foreground" : "bg-surface-2 text-text-muted"
            )}>{i + 1}</div>
            <span className={cn("text-sm font-medium", i <= step ? "text-primary" : "text-text-muted")}>{s}</span>
            {i < steps.length - 1 && <div className={cn("h-0.5 w-8", i < step ? "bg-primary" : "bg-border")} />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="rounded-lg bg-card shadow-card p-8">
          <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          <div
            className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            <Upload className="h-10 w-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-primary font-medium">Drag & drop your CSV file here or click to browse</p>
            <p className="text-sm text-text-muted mt-1">Supports .csv files with headers</p>
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Upload File</Button>
            <Button variant="outline" onClick={downloadTemplate}><Download className="h-4 w-4 mr-2" />Download Template</Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="rounded-lg bg-card shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary">Validation Results</h3>
            <span className="text-sm text-text-secondary">{validRows.length} valid, {errorRows.length} errors</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-surface-2/50">
                <th className="p-2 text-left">Row</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Phone</th><th className="p-2 text-left">Pincode</th><th className="p-2 text-left">Error</th>
              </tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.row} className={cn("border-b border-border", !r.valid && "bg-danger-light/50")}>
                  <td className="p-2">{r.row}</td>
                  <td className="p-2">{r.valid ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-danger" />}</td>
                  <td className="p-2">{r.name || "—"}</td><td className="p-2">{r.phone || "—"}</td><td className="p-2">{r.pincode}</td>
                  <td className="p-2 text-danger text-xs">{r.error}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="flex gap-3 mt-4">
            <Button className="bg-primary text-primary-foreground" onClick={() => setStep(2)} disabled={validRows.length === 0}>
              Continue with {validRows.length} Valid Orders
            </Button>
            <Button variant="outline" onClick={() => { setStep(0); setRows([]); }}>Re-upload</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-lg bg-card shadow-card p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-text-primary">Review {validRows.length} Valid Orders</h3>
          <p className="text-sm text-text-secondary mt-1">Estimated cost: ₹ {estimatedCost}</p>
          <p className="text-xs text-text-muted mt-1">{errorRows.length} rows skipped due to errors</p>
          <Button className="mt-4 bg-primary text-primary-foreground" onClick={handleProcess} disabled={processing}>
            {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Process {validRows.length} Orders
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="rounded-lg bg-card shadow-card p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-text-primary">Processing Complete!</h3>
          <p className="text-sm text-text-secondary mt-1">{processedCount} orders created successfully</p>
          <Button className="mt-4 bg-primary text-primary-foreground" onClick={() => { setStep(0); setRows([]); setProcessedCount(0); }}>
            Upload More
          </Button>
        </div>
      )}
    </div>
  );
}
