import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { User, Bell, Key, Shield, MapPin, CreditCard, FileText } from "lucide-react";
import { pickupAddresses, indianStates } from "@/data/mockData";

const notifEvents = ["Order Placed", "Shipment Picked Up", "Out for Delivery", "Delivered", "NDR Raised", "RTO Initiated", "COD Credited", "Wallet Low Balance"];
const channels = ["Email", "SMS", "WhatsApp"];

export default function DropshipperSettings() {
  const [activeTab, setActiveTab] = useState("profile");

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'kyc', label: 'KYC / Verification', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'bank', label: 'Bank Details', icon: CreditCard },
    { id: 'label', label: 'Label Settings', icon: FileText },
    { id: 'api', label: 'API & Webhooks', icon: Key },
  ];

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Settings" breadcrumb={["Dropshipper", "Settings"]} />

      <div className="flex gap-6">
        {/* Sidebar tabs */}
        <div className="hidden md:block w-52 shrink-0">
          <nav className="space-y-1">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  activeTab === t.id ? "bg-primary text-primary-foreground" : "text-text-secondary hover:bg-surface-2"
                )}>
                <t.icon className="h-4 w-4" />{t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Mobile tabs */}
        <div className="md:hidden flex gap-1 overflow-x-auto border-b border-border mb-4 -mt-2">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={cn("px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-[1px]",
                activeTab === t.id ? "border-primary text-primary" : "border-transparent text-text-secondary"
              )}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'profile' && (
            <div className="rounded-lg bg-card shadow-card p-6 space-y-4 max-w-xl">
              <h3 className="font-semibold text-text-primary">Business Profile</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Business Name</Label><Input defaultValue="QuickShip Store" /></div>
                <div><Label>Contact Person</Label><Input defaultValue="Amit Sharma" /></div>
                <div><Label>Email</Label><Input defaultValue="seller@quickship.in" /></div>
                <div><Label>Phone</Label><Input defaultValue="+91 98000 22222" /></div>
                <div className="sm:col-span-2"><Label>Business Address</Label><Input defaultValue="42, Andheri Industrial Estate, Mumbai" /></div>
                <div><Label>City</Label><Input defaultValue="Mumbai" /></div>
                <div>
                  <Label>State</Label>
                  <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm mt-1" defaultValue="Maharashtra">
                    {indianStates.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div><Label>Pincode</Label><Input defaultValue="400069" /></div>
                <div><Label>GSTIN</Label><Input defaultValue="27AABCU9603R1ZM" className="font-mono" /></div>
              </div>
              <Button className="bg-primary text-primary-foreground hover:bg-primary-dark">Save Changes</Button>
            </div>
          )}

          {activeTab === 'kyc' && (
            <div className="space-y-4 max-w-xl">
              <div className="rounded-lg bg-card shadow-card p-6">
                <h3 className="font-semibold text-text-primary mb-4">KYC Verification</h3>
                <div className="space-y-3">
                  {[
                    { label: 'PAN Card', status: 'Verified', value: 'ABCDE1234F' },
                    { label: 'GST Certificate', status: 'Verified', value: '27AABCU9603R1ZM' },
                    { label: 'Bank Account', status: 'Pending', value: 'XXXX XXXX 1234' },
                    { label: 'Address Proof', status: 'Not Uploaded', value: '' },
                  ].map(doc => (
                    <div key={doc.label} className="flex items-center justify-between p-3 rounded-lg bg-surface-2">
                      <div>
                        <p className="font-medium text-text-primary text-sm">{doc.label}</p>
                        {doc.value && <p className="text-xs text-text-muted font-mono">{doc.value}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
                          doc.status === 'Verified' ? 'bg-success-light text-success-dark' :
                          doc.status === 'Pending' ? 'bg-warning-light text-warning-dark' :
                          'bg-surface-2 text-text-muted border border-border'
                        )}>{doc.status}</span>
                        {doc.status !== 'Verified' && <Button size="sm" variant="outline" className="text-xs h-7">Upload</Button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="rounded-lg bg-card shadow-card overflow-x-auto">
              <div className="p-4 border-b border-border"><h3 className="font-semibold text-text-primary">Notification Preferences</h3></div>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-surface-2/50">
                  <th className="p-3 text-left font-medium text-text-secondary">Event</th>
                  {channels.map(c => <th key={c} className="p-3 text-center font-medium text-text-secondary">{c}</th>)}
                </tr></thead>
                <tbody>
                  {notifEvents.map((ev, i) => (
                    <tr key={ev} className={cn("border-b border-border", i % 2 === 0 && "bg-surface-2/30")}>
                      <td className="p-3 text-text-primary">{ev}</td>
                      {channels.map(c => (
                        <td key={c} className="p-3 text-center">
                          <input type="checkbox" defaultChecked={Math.random() > 0.3} className="h-4 w-4 rounded border-border accent-primary" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-4 border-t border-border">
                <Button className="bg-primary text-primary-foreground hover:bg-primary-dark">Save Preferences</Button>
              </div>
            </div>
          )}

          {activeTab === 'bank' && (
            <div className="rounded-lg bg-card shadow-card p-6 max-w-xl space-y-4">
              <h3 className="font-semibold text-text-primary">Bank Account Details</h3>
              <p className="text-sm text-text-muted">Used for COD settlements and wallet withdrawals</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Account Holder Name</Label><Input defaultValue="Amit Sharma" /></div>
                <div><Label>Account Number</Label><Input defaultValue="XXXX XXXX XXXX 1234" className="font-mono" /></div>
                <div><Label>IFSC Code</Label><Input defaultValue="HDFC0001234" className="font-mono" /></div>
                <div><Label>Bank Name</Label><Input defaultValue="HDFC Bank" /></div>
                <div><Label>Branch</Label><Input defaultValue="Andheri West, Mumbai" /></div>
                <div><Label>Account Type</Label>
                  <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm mt-1">
                    <option>Current</option><option>Savings</option>
                  </select>
                </div>
              </div>
              <Button className="bg-primary text-primary-foreground hover:bg-primary-dark">Save Bank Details</Button>
            </div>
          )}

          {activeTab === 'label' && (
            <div className="rounded-lg bg-card shadow-card p-6 max-w-xl space-y-4">
              <h3 className="font-semibold text-text-primary">Shipping Label Settings</h3>
              <div className="space-y-3">
                <div>
                  <Label>Label Size</Label>
                  <div className="flex gap-2 mt-1">
                    {['4×6 inch', 'A5', 'A4'].map(s => (
                      <button key={s} className={cn("rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all",
                        s === '4×6 inch' ? "border-primary bg-primary-light text-primary" : "border-border text-text-secondary hover:border-primary/30"
                      )}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Display on Label</Label>
                  {['Seller Phone Number', 'Seller Address', 'Product Name', 'Invoice Value', 'Company Logo'].map(opt => (
                    <label key={opt} className="flex items-center gap-2 text-sm text-text-secondary">
                      <input type="checkbox" defaultChecked className="rounded border-border accent-primary" />{opt}
                    </label>
                  ))}
                </div>
              </div>
              <Button className="bg-primary text-primary-foreground hover:bg-primary-dark">Save Label Settings</Button>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="rounded-lg bg-card shadow-card p-6 max-w-xl space-y-4">
              <h3 className="font-semibold text-text-primary">API & Webhooks</h3>
              <div><Label>API Key</Label><Input readOnly defaultValue="sk_live_sf_xxxxxxxxxxxx" className="font-mono text-xs" /></div>
              <div><Label>API Secret</Label><Input readOnly defaultValue="••••••••••••••••" type="password" className="font-mono text-xs" /></div>
              <div><Label>Webhook URL</Label><Input defaultValue="https://example.com/webhook" /></div>
              <div>
                <Label className="mb-2 block">Webhook Events</Label>
                {['order.created', 'order.shipped', 'order.delivered', 'order.ndr', 'order.rto', 'cod.settled'].map(ev => (
                  <label key={ev} className="flex items-center gap-2 text-sm text-text-secondary mb-1">
                    <input type="checkbox" defaultChecked className="rounded border-border accent-primary" />
                    <code className="text-xs bg-surface-2 px-1.5 py-0.5 rounded">{ev}</code>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button className="bg-primary text-primary-foreground hover:bg-primary-dark">Save</Button>
                <Button variant="outline" className="text-danger border-danger/30 hover:bg-danger-light">Regenerate Keys</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
