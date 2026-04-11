import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function DropshipperRates() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Rate Calculator" breadcrumb={["Dropshipper", "Rates"]} />
      <div className="rounded-lg bg-card shadow-card p-6 max-w-md">
        <div className="space-y-3">
          <div><Label>Origin Pincode</Label><Input placeholder="400001" /></div>
          <div><Label>Destination Pincode</Label><Input placeholder="110001" /></div>
          <div><Label>Weight (kg)</Label><Input placeholder="0.5" type="number" /></div>
          <Button className="w-full bg-primary text-primary-foreground hover:bg-primary-dark">Check Rates</Button>
        </div>
      </div>
    </div>
  );
}
