import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Package, Palette, Type, Eye, Monitor, Smartphone, RotateCcw, Bell, Mail, MessageSquare, Phone } from "lucide-react";
import { toast } from "sonner";
import { useBranding, defaultBranding } from "@/contexts/BrandingContext";
import ShopifyConnect from "@/components/ShopifyConnect";

const notifEvents = [
  { label: "Order Placed", icon: "📦" },
  { label: "Shipment Picked Up", icon: "🚚" },
  { label: "Out for Delivery", icon: "🏃" },
  { label: "Delivered", icon: "✅" },
  { label: "NDR Raised", icon: "⚠️" },
  { label: "RTO Initiated", icon: "🔄" },
  { label: "COD Credited", icon: "💰" },
  { label: "Wallet Low Balance", icon: "🔔" },
];

type NotifState = Record<string, { email: boolean; sms: boolean; whatsapp: boolean }>;

const defaultNotifs: NotifState = Object.fromEntries(
  notifEvents.map(e => [e.label, { email: true, sms: Math.random() > 0.3, whatsapp: Math.random() > 0.5 }])
);

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState("general");
  const { branding, setBranding, updateBranding } = useBranding();
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [notifs, setNotifs] = useState<NotifState>(defaultNotifs);

  const toggleNotif = (event: string, channel: "email" | "sms" | "whatsapp") => {
    setNotifs(prev => ({
      ...prev,
      [event]: { ...prev[event], [channel]: !prev[event][channel] }
    }));
  };

  const tabs = ["general", "tracking page", "notifications", "channels", "api"];

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Settings" breadcrumb={["Admin", "Settings"]} />

      <div className="flex gap-2 mb-6 border-b border-border overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn("px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-[1px] transition-colors whitespace-nowrap",
              activeTab === tab ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
            )}>{tab}</button>
        ))}
      </div>

      {activeTab === "general" && (
        <div className="rounded-lg bg-card shadow-card p-6 max-w-xl space-y-4">
          <div><Label>Company Name</Label><Input defaultValue="ShipAmaze Logistics" /></div>
          <div><Label>Contact Email</Label><Input defaultValue="support@shipflow.in" /></div>
          <div><Label>Contact Phone</Label><Input defaultValue="+91 98000 00000" /></div>
          <div><Label>Business Address</Label><Input defaultValue="123, MG Road, Mumbai 400001" /></div>
          <Button className="bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => toast.success("Settings saved")}>Save Changes</Button>
        </div>
      )}

      {activeTab === "tracking page" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="space-y-5">
            <div className="rounded-lg bg-card shadow-card p-6">
              <h3 className="font-semibold text-text-primary flex items-center gap-2 mb-4">
                <Palette className="h-5 w-5 text-primary" /> Brand & Colors
              </h3>
              <div className="space-y-4">
                <div>
                  <Label>Brand Name</Label>
                  <Input value={branding.brandName} onChange={e => updateBranding('brandName', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Logo URL (optional)</Label>
                  <Input value={branding.logoUrl} onChange={e => updateBranding('logoUrl', e.target.value)} placeholder="https://example.com/logo.png" className="mt-1" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Primary Color</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input type="color" value={branding.primaryColor} onChange={e => updateBranding('primaryColor', e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                      <Input value={branding.primaryColor} onChange={e => updateBranding('primaryColor', e.target.value)} className="font-mono text-xs flex-1" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Background</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input type="color" value={branding.bgColor} onChange={e => updateBranding('bgColor', e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                      <Input value={branding.bgColor} onChange={e => updateBranding('bgColor', e.target.value)} className="font-mono text-xs flex-1" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Accent Color</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input type="color" value={branding.accentColor} onChange={e => updateBranding('accentColor', e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                      <Input value={branding.accentColor} onChange={e => updateBranding('accentColor', e.target.value)} className="font-mono text-xs flex-1" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-card shadow-card p-6">
              <h3 className="font-semibold text-text-primary flex items-center gap-2 mb-4">
                <Type className="h-5 w-5 text-primary" /> Content & Messaging
              </h3>
              <div className="space-y-4">
                <div>
                  <Label>Header Text</Label>
                  <Input value={branding.headerText} onChange={e => updateBranding('headerText', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Subtitle</Label>
                  <Input value={branding.subText} onChange={e => updateBranding('subText', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Footer Text</Label>
                  <Input value={branding.footerText} onChange={e => updateBranding('footerText', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Button Style</Label>
                  <div className="flex gap-2 mt-1">
                    {(['rounded', 'square', 'pill'] as const).map(style => (
                      <button key={style} onClick={() => updateBranding('buttonStyle', style)}
                        className={cn("px-4 py-1.5 text-sm border-2 capitalize transition-colors",
                          style === 'rounded' && "rounded-lg",
                          style === 'square' && "rounded-none",
                          style === 'pill' && "rounded-full",
                          branding.buttonStyle === style ? "border-primary bg-primary-light text-primary" : "border-border text-text-secondary"
                        )}>{style}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show "Powered by" branding</Label>
                    <p className="text-xs text-text-muted">Display footer attribution</p>
                  </div>
                  <button onClick={() => updateBranding('showBranding', !branding.showBranding)}
                    className={cn("w-11 h-6 rounded-full transition-colors relative",
                      branding.showBranding ? "bg-primary" : "bg-surface-2")}>
                    <div className={cn("w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform",
                      branding.showBranding ? "translate-x-5" : "translate-x-0.5")} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={() => { toast.success('Tracking page settings saved!'); }} className="bg-primary text-primary-foreground hover:bg-primary-dark flex-1">
                Save & Publish
              </Button>
              <Button variant="outline" onClick={() => setBranding(defaultBranding)}>
                <RotateCcw className="h-4 w-4 mr-1" /> Reset
              </Button>
            </div>
          </div>

          {/* Live Preview */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-text-primary flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" /> Live Preview
              </h3>
              <div className="flex gap-1 rounded-lg bg-surface-2 p-0.5">
                <button onClick={() => setPreviewDevice('desktop')}
                  className={cn("p-1.5 rounded-md transition-colors", previewDevice === 'desktop' ? "bg-card shadow-sm" : "text-text-muted")}>
                  <Monitor className="h-4 w-4" />
                </button>
                <button onClick={() => setPreviewDevice('mobile')}
                  className={cn("p-1.5 rounded-md transition-colors", previewDevice === 'mobile' ? "bg-card shadow-sm" : "text-text-muted")}>
                  <Smartphone className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className={cn("rounded-xl border-2 border-border overflow-hidden shadow-card-md transition-all mx-auto",
              previewDevice === 'mobile' ? "max-w-[375px]" : "w-full")}>
              <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ backgroundColor: branding.primaryColor }}>
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt="Logo" className="h-6 w-6 rounded object-cover" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
                    <Package className="h-4 w-4 text-white" />
                  </div>
                )}
                <span className="text-sm font-bold text-white">{branding.brandName}</span>
              </div>

              <div className="p-6" style={{ backgroundColor: branding.bgColor, minHeight: 320 }}>
                <div className="bg-white rounded-xl shadow-lg p-6 max-w-md mx-auto">
                  <h2 className="text-lg font-bold text-center mb-1" style={{ color: '#1a1a2e' }}>
                    {branding.headerText}
                  </h2>
                  <p className="text-xs text-center mb-4" style={{ color: '#6b7280' }}>
                    {branding.subText}
                  </p>
                  <div className="flex gap-2">
                    <div className="flex-1 h-9 rounded-lg border border-gray-200 bg-gray-50 px-3 flex items-center">
                      <span className="text-xs text-gray-400">Enter AWB or Order ID</span>
                    </div>
                    <button className={cn("h-9 px-4 text-xs font-medium text-white flex items-center gap-1",
                      branding.buttonStyle === 'rounded' && "rounded-lg",
                      branding.buttonStyle === 'square' && "rounded-none",
                      branding.buttonStyle === 'pill' && "rounded-full"
                    )} style={{ backgroundColor: branding.primaryColor }}>
                      Track
                    </button>
                  </div>

                  <div className="mt-5 space-y-3">
                    {['Order Placed', 'Picked Up', 'In Transit', 'Out for Delivery'].map((step, i) => (
                      <div key={step} className="flex items-center gap-3">
                        <div className={cn("w-3 h-3 rounded-full border-2 shrink-0",
                          i < 3 ? "border-transparent" : "border-gray-300")}
                          style={i < 3 ? { backgroundColor: branding.accentColor } : {}} />
                        <div className="flex-1">
                          <p className="text-xs font-medium" style={{ color: i < 3 ? '#1a1a2e' : '#9ca3af' }}>{step}</p>
                        </div>
                        {i < 3 && <span className="text-[10px]" style={{ color: '#9ca3af' }}>Apr {5+i}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {branding.showBranding && (
                  <p className="text-center text-[10px] mt-4" style={{ color: '#9ca3af' }}>{branding.footerText}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "notifications" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-text-primary flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" /> Notification Preferences
              </h3>
              <p className="text-xs text-text-muted mt-0.5">Configure which events trigger notifications on each channel</p>
            </div>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary-dark text-xs" onClick={() => toast.success("Notification preferences saved")}>
              Save Preferences
            </Button>
          </div>
          <div className="rounded-lg bg-card shadow-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/50">
                  <th className="p-4 text-left font-medium text-text-secondary">Event</th>
                  <th className="p-4 text-center font-medium text-text-secondary">
                    <div className="flex items-center justify-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</div>
                  </th>
                  <th className="p-4 text-center font-medium text-text-secondary">
                    <div className="flex items-center justify-center gap-1.5"><Phone className="h-3.5 w-3.5" /> SMS</div>
                  </th>
                  <th className="p-4 text-center font-medium text-text-secondary">
                    <div className="flex items-center justify-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> WhatsApp</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {notifEvents.map((ev, i) => (
                  <tr key={ev.label} className={cn("border-b border-border last:border-0", i % 2 === 0 && "bg-surface-2/20")}>
                    <td className="p-4">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{ev.icon}</span>
                        <span className="text-text-primary font-medium">{ev.label}</span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center">
                        <Switch checked={notifs[ev.label]?.email} onCheckedChange={() => toggleNotif(ev.label, "email")} />
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center">
                        <Switch checked={notifs[ev.label]?.sms} onCheckedChange={() => toggleNotif(ev.label, "sms")} />
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center">
                        <Switch checked={notifs[ev.label]?.whatsapp} onCheckedChange={() => toggleNotif(ev.label, "whatsapp")} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "channels" && (
        <div className="max-w-2xl space-y-4">
          <ShopifyConnect />
        </div>
      )}

      {activeTab === "api" && (
        <div className="rounded-lg bg-card shadow-card p-6 max-w-xl space-y-4">
          <div><Label>API Key</Label><Input readOnly defaultValue="sk_live_xxxxxxxxxxxxxxxxxx" className="font-mono text-xs" /></div>
          <div><Label>Webhook URL</Label><Input defaultValue="https://example.com/webhook" /></div>
          <Button className="bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => toast.success("API key regenerated")}>Regenerate API Key</Button>
        </div>
      )}
    </div>
  );
}
