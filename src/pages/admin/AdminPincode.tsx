import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { pincodeServiceData, indianStates } from "@/data/mockData";
import { MapPin, CheckCircle2, XCircle, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function AdminPincode() {
  const [pincode, setPincode] = useState("");
  const [result, setResult] = useState<typeof pincodeServiceData[0] | null>(null);
  const [searched, setSearched] = useState(false);

  const handleCheck = () => {
    setSearched(true);
    const found = pincodeServiceData.find(p => p.pincode === pincode);
    setResult(found || null);
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Pincode Serviceability" breadcrumb={["Admin", "Pincode Check"]} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-lg bg-card shadow-card p-6">
          <h3 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />Check Serviceability
          </h3>
          <div className="space-y-3">
            <div>
              <Label>Enter Pincode</Label>
              <Input value={pincode} onChange={e => setPincode(e.target.value)} placeholder="e.g. 400001" className="mt-1" />
            </div>
            <Button onClick={handleCheck} className="w-full bg-primary text-primary-foreground hover:bg-primary-dark">
              <Search className="h-4 w-4 mr-2" />Check Serviceability
            </Button>
          </div>

          {searched && !result && (
            <div className="mt-4 rounded-lg bg-danger-light p-4 text-center">
              <XCircle className="h-8 w-8 text-danger mx-auto mb-2" />
              <p className="font-medium text-danger-dark">Pincode not serviceable</p>
              <p className="text-sm text-text-muted mt-1">This pincode is currently not covered by any courier partner.</p>
            </div>
          )}
        </div>

        {result && (
          <div className="lg:col-span-2">
            <div className="rounded-lg bg-card shadow-card p-6 mb-4">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 className="h-6 w-6 text-success" />
                <div>
                  <h3 className="font-semibold text-text-primary">Serviceable ✓</h3>
                  <p className="text-sm text-text-secondary">{result.city}, {result.state} · Zone {result.zone}</p>
                </div>
              </div>

              <div className="rounded-lg bg-surface-2 p-3 grid grid-cols-3 gap-4 text-center mb-4">
                <div>
                  <p className="text-2xl font-bold text-primary">{result.couriers.length}</p>
                  <p className="text-xs text-text-muted">Couriers Available</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-success">{result.couriers.filter(c => c.cod).length}</p>
                  <p className="text-xs text-text-muted">COD Supported</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-secondary">{result.couriers.filter(c => c.air).length}</p>
                  <p className="text-xs text-text-muted">Air Available</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-card shadow-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-surface-2/50">
                  <th className="p-3 text-left font-medium text-text-secondary">Courier</th>
                  <th className="p-3 text-center font-medium text-text-secondary">Surface</th>
                  <th className="p-3 text-center font-medium text-text-secondary">Air</th>
                  <th className="p-3 text-center font-medium text-text-secondary">COD</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Est. Delivery</th>
                </tr></thead>
                <tbody>
                  {result.couriers.map(c => (
                    <tr key={c.name} className="border-b border-border last:border-0">
                      <td className="p-3 flex items-center gap-2">
                        <Truck className="h-4 w-4 text-primary" />
                        <span className="font-medium text-text-primary">{c.name}</span>
                      </td>
                      <td className="p-3 text-center">{c.surface ? <CheckCircle2 className="h-4 w-4 text-success mx-auto" /> : <XCircle className="h-4 w-4 text-text-muted mx-auto" />}</td>
                      <td className="p-3 text-center">{c.air ? <CheckCircle2 className="h-4 w-4 text-success mx-auto" /> : <XCircle className="h-4 w-4 text-text-muted mx-auto" />}</td>
                      <td className="p-3 text-center">{c.cod ? <CheckCircle2 className="h-4 w-4 text-success mx-auto" /> : <XCircle className="h-4 w-4 text-text-muted mx-auto" />}</td>
                      <td className="p-3 text-text-secondary">{c.estimatedDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
