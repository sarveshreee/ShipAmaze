import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function DropshipperSettings() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Settings" breadcrumb={["Dropshipper", "Settings"]} />
      <div className="rounded-lg bg-card shadow-card p-6 max-w-xl space-y-4">
        <div><Label>Business Name</Label><Input defaultValue="QuickShip Store" /></div>
        <div><Label>Contact Email</Label><Input defaultValue="seller@quickship.in" /></div>
        <div><Label>Phone</Label><Input defaultValue="+91 98000 22222" /></div>
        <div><Label>GSTIN</Label><Input defaultValue="27AABCU9603R1ZM" /></div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary-dark">Save Changes</Button>
      </div>
    </div>
  );
}
