import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function VendorSettings() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Settings" breadcrumb={["Vendor", "Settings"]} />
      <div className="rounded-lg bg-card shadow-card p-6 max-w-xl space-y-4">
        <div><Label>Warehouse Name</Label><Input defaultValue="Mumbai Central Hub" /></div>
        <div><Label>Contact Person</Label><Input defaultValue="Rajesh Kumar" /></div>
        <div><Label>Phone</Label><Input defaultValue="+91 98000 11111" /></div>
        <div><Label>Address</Label><Input defaultValue="Plot 42, MIDC, Andheri East, Mumbai" /></div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => toast.success("Settings saved successfully")}>Save Changes</Button>
      </div>
    </div>
  );
}
