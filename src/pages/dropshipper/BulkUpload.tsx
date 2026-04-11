import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = ["Upload", "Validate", "Review", "Confirm"];
const sampleRows = Array.from({ length: 8 }, (_, i) => ({
  row: i + 1,
  valid: i !== 2 && i !== 5,
  name: ["Amit", "Priya", "", "Rahul", "Sneha", "Vikram", "Anjali", "Ravi"][i],
  phone: i === 5 ? "" : `98000000${i}0`,
  pincode: ["400001", "110001", "560001", "600001", "500001", "411001", "700001", "380001"][i],
  weight: "0.5",
  error: i === 2 ? "Name is required" : i === 5 ? "Phone is required" : "",
}));

export default function BulkUpload() {
  const [step, setStep] = useState(0);

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
          <div className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary transition-colors cursor-pointer">
            <Upload className="h-10 w-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-primary font-medium">Drag & drop your CSV file here or click to browse</p>
            <p className="text-sm text-text-muted mt-1">Supports .csv and .xlsx files</p>
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setStep(1)}><Upload className="h-4 w-4 mr-2"/>Upload File</Button>
            <Button variant="outline"><Download className="h-4 w-4 mr-2"/>Download Template</Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="rounded-lg bg-card shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary">Validation Results</h3>
            <span className="text-sm text-text-secondary">6 valid, 2 errors</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-surface-2/50">
                <th className="p-2 text-left">Row</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Phone</th><th className="p-2 text-left">Pincode</th><th className="p-2 text-left">Error</th>
              </tr></thead>
              <tbody>{sampleRows.map(r => (
                <tr key={r.row} className={cn("border-b border-border", !r.valid && "bg-danger-light/50")}>
                  <td className="p-2">{r.row}</td>
                  <td className="p-2">{r.valid ? <CheckCircle2 className="h-4 w-4 text-success"/> : <XCircle className="h-4 w-4 text-danger"/>}</td>
                  <td className="p-2">{r.name || "—"}</td><td className="p-2">{r.phone || "—"}</td><td className="p-2">{r.pincode}</td>
                  <td className="p-2 text-danger text-xs">{r.error}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <Button className="mt-4 bg-primary text-primary-foreground" onClick={() => setStep(2)}>Continue with Valid Orders</Button>
        </div>
      )}

      {step >= 2 && (
        <div className="rounded-lg bg-card shadow-card p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-text-primary">{step === 2 ? "Review 6 Valid Orders" : "Processing Complete!"}</h3>
          <p className="text-sm text-text-secondary mt-1">Estimated cost: ₹ 270</p>
          <Button className="mt-4 bg-primary text-primary-foreground" onClick={() => setStep(Math.min(step + 1, 3))}>
            {step === 2 ? "Process 6 Orders" : "Done"}
          </Button>
        </div>
      )}
    </div>
  );
}
