import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import * as dropshipperService from "@/services/dropshipperService";
import { useAuth } from "@/contexts/AuthContext";
import {
  Shield, Building2, Users2, Upload, CheckCircle2, Clock, AlertCircle, Plus,
  Star, Trash2, Copy, RefreshCw, User, Briefcase, FileCheck, X, Link2, Loader2, Image as ImageIcon
} from "lucide-react";
import ShopifyConnect from "@/components/ShopifyConnect";
import * as labelInvoiceSettingsService from "@/services/labelInvoiceSettingsService";
import { DEFAULT_LABEL_INVOICE_SETTINGS } from "@/types/labelInvoice";
import { createOrderLabelElement, getLabelPreviewSampleOrder } from "@/components/orderLabelDom";

/* ===========================================================
   Types
=========================================================== */
type AccountType = "individual" | "company";
type KycStatus = "draft" | "pending" | "verified" | "rejected";
type BankStatus = "pending" | "verifying" | "verified" | "failed";
type MemberStatus = "active" | "invited" | "disabled";

interface KycProfile {
  id?: string;
  account_type: AccountType;
  status: KycStatus;
  full_name?: string;
  dob?: string;
  business_name?: string;
  pan_number?: string;
  aadhaar_number?: string;
  gst_number?: string;
  cin_number?: string;
  authorized_person_name?: string;
  authorized_person_pan?: string;
  address?: string;
  uploaded_docs?: Record<string, string>;
  rejectionRemark?: string;
}

const KYC_MAX_FILE_BYTES = 2 * 1024 * 1024;

function cleanKycDocs(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      ([, v]) => typeof v === "string" && v.trim().length > 0
    )
  ) as Record<string, string>;
}

function openKycDocument(raw: string, label: string) {
  const url = String(raw ?? "").trim();
  if (!url) return;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  let src = url;
  if (!src.startsWith("data:") && /^[A-Za-z0-9+/=\s]+$/.test(src) && src.length > 100) {
    const compact = src.replace(/\s/g, "");
    const mime = compact.startsWith("JVBER") ? "application/pdf" : "image/jpeg";
    src = `data:${mime};base64,${compact}`;
  }
  if (!src.startsWith("data:")) {
    toast.error("Unable to preview this document");
    return;
  }
  try {
    const [meta, b64] = src.split(",", 2);
    const mime = meta.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const win = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!win) {
      // Popup blocked — fall back to download-style anchor
      const a = document.createElement("a");
      a.href = blobUrl;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.download = label.replace(/\s+/g, "_");
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch {
    toast.error("Failed to open document");
  }
}

interface BankAccount {
  id: string;
  account_holder_name: string;
  account_number_masked: string;
  ifsc: string;
  bank_name: string;
  account_type: string;
  status: BankStatus;
  is_primary: boolean;
  created_at: string;
}

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  permissions: string[];
  status: MemberStatus;
  invited_at: string;
}

const ALL_PERMISSIONS = ["Orders", "Shipments", "Payouts", "Channels", "Reports", "Browse Products", "Billing", "NDR"];
const ROLES = ["Manager", "Operations", "Finance", "Support"];

/* ===========================================================
   Main Page
=========================================================== */
export default function DropshipperSettings() {
  const { userId } = useAuth();
  const [tab, setTab] = useState("kyc");

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Account Settings" breadcrumb={["Dropshipper", "Settings"]} />
      <p className="-mt-3 mb-5 text-sm text-text-muted">
        Manage your KYC, bank details, and team access from one place.
      </p>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-auto p-1 bg-surface-2 rounded-xl mb-5">
          <TabsTrigger value="kyc" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg">
            <Shield className="h-4 w-4" /> KYC
          </TabsTrigger>
          <TabsTrigger value="bank" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg">
            <Building2 className="h-4 w-4" /> Bank
          </TabsTrigger>
          <TabsTrigger value="logo" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg">
            <ImageIcon className="h-4 w-4" /> Label Logo
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg">
            <Users2 className="h-4 w-4" /> Team
          </TabsTrigger>
          <TabsTrigger value="channels" className="gap-2 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg">
            <Link2 className="h-4 w-4" /> Channels
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kyc" className="mt-0"><KycTab userId={userId} /></TabsContent>
        <TabsContent value="bank" className="mt-0"><BankTab userId={userId} /></TabsContent>
        <TabsContent value="logo" className="mt-0"><LabelLogoTab /></TabsContent>
        <TabsContent value="team" className="mt-0"><TeamTab userId={userId} /></TabsContent>
        <TabsContent value="channels" className="mt-0"><ChannelsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ===========================================================
   KYC TAB
=========================================================== */
function StatusPill({ status }: { status: KycStatus }) {
  const map: Record<KycStatus, { label: string; cls: string; icon: any }> = {
    draft:    { label: "Draft",    cls: "bg-surface-2 text-text-secondary border-border", icon: Clock },
    pending:  { label: "Pending",  cls: "bg-warning-light text-warning-dark border-warning/30", icon: Clock },
    verified: { label: "Verified", cls: "bg-success-light text-success-dark border-success/30", icon: CheckCircle2 },
    rejected: { label: "Rejected", cls: "bg-danger-light text-danger-dark border-danger/30", icon: AlertCircle },
  };
  const m = map[status];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border", m.cls)}>
      <Icon className="h-3.5 w-3.5" /> {m.label}
    </span>
  );
}

function FileUploadField({ label, value, onChange }: { label: string; value?: string; onChange: (dataUrl: string | undefined) => void; }) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > KYC_MAX_FILE_BYTES) { toast.error("File too large (max 2MB)"); return; }
    if (!/\.(jpg|jpeg|png|webp)$/i.test(f.name) && !f.type.startsWith("image/")) {
      toast.error("Only JPG/PNG/WEBP images allowed");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange(String(reader.result ?? ""));
      toast.success(`${f.name} uploaded`);
    };
    reader.onerror = () => toast.error("Failed to read file");
    reader.readAsDataURL(f);
  };
  const canView = !!value && (value.startsWith("data:") || /^https?:\/\//i.test(value) || value.length > 100);
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-success/30 bg-success-light px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <FileCheck className="h-4 w-4 text-success-dark shrink-0" />
            {canView ? (
              <button
                type="button"
                onClick={() => openKycDocument(value, label)}
                className="text-sm text-success-dark truncate hover:underline text-left"
              >
                View uploaded file
              </button>
            ) : (
              <span className="text-sm text-success-dark truncate">Document uploaded</span>
            )}
          </div>
          <button type="button" onClick={() => onChange(undefined)} className="text-danger hover:text-danger-dark shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-surface-2/50 px-3 py-2.5 text-sm text-text-muted hover:bg-surface-2 hover:border-primary/40 transition-colors">
          <Upload className="h-4 w-4" />
          Click to upload (JPG/PNG/WEBP, max 2MB)
          <input type="file" accept=".jpg,.jpeg,.png,.webp,image/*" onChange={handleFile} className="hidden" />
        </label>
      )}
    </div>
  );
}

function KycPendingBanner() {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning-light/50 px-4 py-3 flex items-start gap-3">
      <Clock className="h-5 w-5 text-warning-dark shrink-0 mt-0.5" />
      <div>
        <p className="font-medium text-text-primary text-sm">Submitted — awaiting admin approval</p>
        <p className="text-xs text-text-secondary mt-1 leading-relaxed">
          Your KYC documents are under review. Please wait for admin approval before editing or resubmitting. This usually takes 1–2 business days.
        </p>
      </div>
    </div>
  );
}

function KycRejectedBanner({ remark }: { remark?: string }) {
  return (
    <div className="rounded-xl border border-danger/30 bg-danger-light/50 px-4 py-3 flex items-start gap-3">
      <AlertCircle className="h-5 w-5 text-danger-dark shrink-0 mt-0.5" />
      <div>
        <p className="font-medium text-text-primary text-sm">KYC rejected — please update and resubmit</p>
        <p className="text-xs text-text-secondary mt-1 leading-relaxed">
          {remark?.trim() || "Your KYC was rejected. Fix the issues below and submit again."}
        </p>
      </div>
    </div>
  );
}

function mapApiKyc(data: Record<string, unknown>): KycProfile {
  const docs = cleanKycDocs(data.uploaded_docs ?? data.documents);
  return {
    ...(data as unknown as KycProfile),
    account_type: (data.account_type as AccountType) || "individual",
    status: (data.status as KycStatus) || "draft",
    uploaded_docs: docs,
    rejectionRemark: String(data.rejectionRemark ?? ""),
  };
}

function KycTab({ userId }: { userId: string | null }) {
  const [profile, setProfile] = useState<KycProfile>({ account_type: "individual", status: "draft", uploaded_docs: {} });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!userId) {
        setLoading(false);
        return;
      }
      try {
        const data = (await dropshipperService.getKyc()) as Record<string, unknown>;
        if (data && Object.keys(data).length) {
          setProfile(mapApiKyc(data));
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to load KYC");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const update = (patch: Partial<KycProfile>) => setProfile(p => ({ ...p, ...patch }));
  const updateDoc = (key: string, filename?: string) => {
    setProfile(p => {
      const docs = { ...(p.uploaded_docs || {}) };
      if (filename) docs[key] = filename; else delete docs[key];
      return { ...p, uploaded_docs: docs };
    });
  };

  const saveDraft = async () => {
    if (!userId) { toast.error("Not signed in"); return; }
    setSaving(true);
    try {
      const saved = await dropshipperService.saveKyc({
        ...profile,
        uploaded_docs: profile.uploaded_docs,
        documents: profile.uploaded_docs,
        status: profile.status === "verified" ? "verified" : "draft",
      } as unknown as Record<string, unknown>) as Record<string, unknown>;
      if (saved && typeof saved === "object") setProfile(mapApiKyc(saved));
      toast.success("Draft saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    const errs: string[] = [];
    if (profile.account_type === "individual") {
      if (!profile.full_name) errs.push("Full name");
      if (!profile.pan_number || !/^[A-Z]{5}\d{4}[A-Z]$/.test(profile.pan_number)) errs.push("Valid PAN");
      if (!profile.aadhaar_number || profile.aadhaar_number.replace(/\s/g, "").length !== 12) errs.push("Valid Aadhaar");
      if (!profile.dob) errs.push("Date of birth");
      const docs = profile.uploaded_docs ?? {};
      if (!docs.pan) errs.push("PAN card upload");
      if (!docs.aadhaarFront && !docs.aadhaar) errs.push("Aadhaar front upload");
      if (!docs.aadhaarBack) errs.push("Aadhaar back upload");
    } else {
      if (!profile.business_name) errs.push("Business name");
      if (!profile.pan_number || !/^[A-Z]{5}\d{4}[A-Z]$/.test(profile.pan_number)) errs.push("Valid PAN");
      if (!profile.gst_number) errs.push("GST number");
      if (!profile.cin_number) errs.push("CIN / Registration number");
      if (!profile.authorized_person_name) errs.push("Authorized person name");
      if (!profile.authorized_person_pan || !/^[A-Z]{5}\d{4}[A-Z]$/.test(profile.authorized_person_pan)) {
        errs.push("Valid authorized person PAN");
      }
      const docs = profile.uploaded_docs ?? {};
      if (!docs.pan) errs.push("PAN card upload");
      if (!docs.gst) errs.push("GST certificate upload");
      if (!docs.cin) errs.push("CIN document upload");
      if (!docs.reg) errs.push("Registration document upload");
      if (!docs.auth_id) errs.push("Authorized person ID proof upload");
    }
    if (!profile.address) errs.push("Address");
    if (errs.length) { toast.error(`Missing: ${errs.join(", ")}`); return; }

    setSubmitting(true);
    try {
      const payload = {
        ...profile,
        uploaded_docs: profile.uploaded_docs,
        documents: profile.uploaded_docs,
        termsAccepted: true,
      };
      const saved = await dropshipperService.submitKyc(payload as unknown as Record<string, unknown>) as Record<string, unknown>;
      if (saved && typeof saved === "object") setProfile(mapApiKyc(saved));
      else setProfile(p => ({ ...p, status: "pending", rejectionRemark: "" }));
      toast.success("Submitted for admin approval");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const isLocked = profile.status === "pending" || profile.status === "verified";

  // Checklist
  const checklist = useMemo(() => [
    { label: "Email verified", done: true },
    { label: "Phone verified", done: true },
    { label: "KYC documents", done: profile.status === "verified" || profile.status === "pending" },
    { label: "Bank account linked", done: false /* updated externally if needed */ },
    { label: "GST (optional)", done: !!profile.gst_number, optional: true },
  ], [profile]);

  if (loading) return <div className="rounded-xl bg-card shadow-card p-12 text-center text-text-muted">Loading…</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
      {/* Main form */}
      <div className="rounded-xl bg-card shadow-card p-6 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">KYC Verification</h3>
            <p className="text-sm text-text-muted mt-0.5">Required to receive payouts and access full features.</p>
          </div>
          <StatusPill status={profile.status} />
        </div>

        {profile.status === "pending" && <KycPendingBanner />}
        {profile.status === "rejected" && <KycRejectedBanner remark={profile.rejectionRemark} />}

        {/* Account type cards */}
        <div>
          <Label className="mb-2 block">Account Type</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { key: "individual", icon: User, title: "Individual", sub: "Sole proprietor or freelancer using PAN & Aadhaar." },
              { key: "company", icon: Briefcase, title: "Company", sub: "Pvt Ltd, LLP, or Partnership with GST & CIN." },
            ] as const).map(opt => {
              const active = profile.account_type === opt.key;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={isLocked}
                  onClick={() => update({ account_type: opt.key })}
                  className={cn(
                    "rounded-xl border-2 p-4 text-left transition-all flex gap-3 items-start",
                    active ? "border-primary bg-primary-light" : "border-border bg-surface-2/40 hover:border-primary/40",
                    isLocked && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <span className={cn("flex h-5 w-5 mt-0.5 items-center justify-center rounded-full border-2 shrink-0",
                    active ? "border-primary" : "border-border"
                  )}>
                    {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium text-text-primary"><Icon className="h-4 w-4" /> {opt.title}</div>
                    <p className="text-xs text-text-muted mt-1">{opt.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Fields */}
        <fieldset disabled={isLocked} className="space-y-4 disabled:opacity-70">
          {profile.account_type === "individual" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Full name (as per PAN) <span className="text-danger">*</span></Label><Input value={profile.full_name || ""} onChange={e => update({ full_name: e.target.value })} placeholder="Your full name" /></div>
              <div><Label>Date of birth <span className="text-danger">*</span></Label><Input type="date" value={profile.dob || ""} onChange={e => update({ dob: e.target.value })} /></div>
              <div><Label>PAN number <span className="text-danger">*</span></Label><Input value={profile.pan_number || ""} onChange={e => update({ pan_number: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" className="font-mono uppercase" maxLength={10} /></div>
              <div><Label>Aadhaar number <span className="text-danger">*</span></Label><Input value={profile.aadhaar_number || ""} onChange={e => update({ aadhaar_number: e.target.value })} placeholder="XXXX XXXX XXXX" className="font-mono" maxLength={14} /></div>
              <div className="sm:col-span-2"><Label>Residential address <span className="text-danger">*</span></Label><Input value={profile.address || ""} onChange={e => update({ address: e.target.value })} placeholder="House, street, area, city, pincode" /></div>
              <FileUploadField label="PAN card (front) *" value={profile.uploaded_docs?.pan} onChange={v => updateDoc("pan", v)} />
              <FileUploadField label="Aadhaar Front Upload *" value={profile.uploaded_docs?.aadhaarFront ?? profile.uploaded_docs?.aadhaar} onChange={v => updateDoc("aadhaarFront", v)} />
              <FileUploadField label="Aadhaar Back Upload *" value={profile.uploaded_docs?.aadhaarBack} onChange={v => updateDoc("aadhaarBack", v)} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><Label>Legal business name <span className="text-danger">*</span></Label><Input value={profile.business_name || ""} onChange={e => update({ business_name: e.target.value })} placeholder="Acme Pvt Ltd" /></div>
              <div><Label>PAN number <span className="text-danger">*</span></Label><Input value={profile.pan_number || ""} onChange={e => update({ pan_number: e.target.value.toUpperCase() })} className="font-mono uppercase" maxLength={10} /></div>
              <div><Label>GST number <span className="text-danger">*</span></Label><Input value={profile.gst_number || ""} onChange={e => update({ gst_number: e.target.value.toUpperCase() })} className="font-mono uppercase" maxLength={15} /></div>
              <div><Label>CIN / Registration number <span className="text-danger">*</span></Label><Input value={profile.cin_number || ""} onChange={e => update({ cin_number: e.target.value.toUpperCase() })} className="font-mono uppercase" maxLength={21} /></div>
              <div><Label>Authorized person name <span className="text-danger">*</span></Label><Input value={profile.authorized_person_name || ""} onChange={e => update({ authorized_person_name: e.target.value })} /></div>
              <div><Label>Authorized person PAN <span className="text-danger">*</span></Label><Input value={profile.authorized_person_pan || ""} onChange={e => update({ authorized_person_pan: e.target.value.toUpperCase() })} className="font-mono uppercase" maxLength={10} /></div>
              <div className="sm:col-span-2"><Label>Business address <span className="text-danger">*</span></Label><Input value={profile.address || ""} onChange={e => update({ address: e.target.value })} /></div>
              <FileUploadField label="PAN card *" value={profile.uploaded_docs?.pan} onChange={v => updateDoc("pan", v)} />
              <FileUploadField label="GST certificate *" value={profile.uploaded_docs?.gst} onChange={v => updateDoc("gst", v)} />
              <FileUploadField label="CIN document *" value={profile.uploaded_docs?.cin} onChange={v => updateDoc("cin", v)} />
              <FileUploadField label="Registration document *" value={profile.uploaded_docs?.reg} onChange={v => updateDoc("reg", v)} />
              <FileUploadField label="Authorized person ID proof *" value={profile.uploaded_docs?.auth_id} onChange={v => updateDoc("auth_id", v)} />
            </div>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
          <p className="text-xs text-text-muted">
            {submitting
              ? "Uploading documents and submitting — please wait…"
              : profile.status === "pending"
                ? "Your submission is with our team for review."
                : "By submitting you agree to our verification policy."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void saveDraft()} disabled={isLocked || submitting || saving}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Save draft"}
            </Button>
            <Button onClick={() => void submit()} disabled={isLocked || submitting || saving} className="bg-primary text-primary-foreground hover:bg-primary-dark min-w-[180px]">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Submitting…
                </>
              ) : profile.status === "pending" ? (
                "Awaiting approval"
              ) : profile.status === "rejected" ? (
                "Resubmit for verification"
              ) : (
                "Submit for verification"
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <div className="rounded-xl bg-card shadow-card p-5">
          <h4 className="font-semibold text-text-primary mb-3">Verification checklist</h4>
          <ul className="space-y-2.5">
            {checklist.map(item => (
              <li key={item.label} className="flex items-center gap-2 text-sm">
                {item.done
                  ? <CheckCircle2 className="h-4 w-4 text-success" />
                  : <span className="h-4 w-4 rounded-full border-2 border-border inline-block" />}
                <span className={cn(item.done ? "text-text-primary" : "text-text-muted")}>{item.label}</span>
                {item.optional && <Badge variant="outline" className="ml-auto text-[10px]">optional</Badge>}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-primary-light/60 border border-primary/20 p-4">
          <p className="font-medium text-text-primary text-sm">Why KYC?</p>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">
            As per RBI guidelines, KYC is mandatory before processing any payouts to your bank account.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   BANK TAB
=========================================================== */
function mapApiBank(row: Record<string, unknown>): BankAccount {
  const num = String(row.accountNumber ?? row.account_number ?? "");
  const masked = num.length > 4 ? `XXXX XXXX ${num.slice(-4)}` : num;
  return {
    id: String(row.id ?? ""),
    account_holder_name: String(row.accountHolder ?? row.account_holder_name ?? ""),
    account_number_masked: String(row.account_number_masked ?? masked),
    ifsc: String(row.ifsc ?? ""),
    bank_name: String(row.bankName ?? row.bank_name ?? ""),
    account_type: String((row as { accountType?: string }).accountType ?? "Savings"),
    status: (String(row.status ?? "pending") as BankStatus) || "pending",
    is_primary: Boolean(row.isPrimary ?? row.is_primary),
    created_at: String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
  };
}

function BankTab({ userId }: { userId: string | null }) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!userId) {
      setAccounts([]);
      setLoading(false);
      return;
    }
    try {
      const rows = (await dropshipperService.listBankAccounts()) as unknown[];
      setAccounts((Array.isArray(rows) ? rows : []).map((r) => mapApiBank(r as Record<string, unknown>)));
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [userId]);

  const addAccount = async (a: {
    account_holder_name: string;
    ifsc: string;
    bank_name: string;
    account_type: string;
    accountNumber: string;
  }) => {
    try {
      await dropshipperService.createBankAccount({
        accountHolder: a.account_holder_name,
        bankName: a.bank_name,
        accountNumber: a.accountNumber.replace(/\s/g, ""),
        ifsc: a.ifsc,
        isPrimary: accounts.length === 0,
        status: "pending",
      });
      toast.success("Bank account added");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
      throw e;
    }
  };

  const setPrimary = async (id: string) => {
    const target = accounts.find((x) => x.id === id);
    if (!target || target.status !== "verified") {
      toast.error("Only verified accounts can be primary");
      return;
    }
    try {
      for (const x of accounts) {
        if (x.id === id) continue;
        if (x.is_primary) await dropshipperService.updateBankAccount(x.id, { isPrimary: false });
      }
      await dropshipperService.updateBankAccount(id, { isPrimary: true });
      toast.success("Primary account updated");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const removeAccount = async (id: string) => {
    if (!confirm("Delete this account?")) return;
    try {
      await dropshipperService.deleteBankAccount(id);
      toast.success("Account deleted");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const retry = async (id: string) => {
    try {
      await dropshipperService.updateBankAccount(id, { status: "pending" });
      toast.info("Status updated");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="rounded-xl bg-card shadow-card p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Bank Accounts</h3>
          <p className="text-sm text-text-muted mt-0.5">Payouts will be sent to your primary verified account.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2">
          <Plus className="h-4 w-4" /> Add account
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-text-muted">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-border rounded-xl">
          <Building2 className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">No bank accounts yet</p>
          <p className="text-sm text-text-muted mt-1">Add one to receive your COD settlements and payouts.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {accounts.map(a => (
            <div key={a.id} className="rounded-xl border border-border p-4 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-text-primary">{a.bank_name}</p>
                    {a.is_primary && <Badge className="bg-primary text-primary-foreground gap-1 text-[10px]"><Star className="h-3 w-3" />Primary</Badge>}
                  </div>
                  <p className="text-sm text-text-muted font-mono mt-0.5">{a.account_number_masked}</p>
                </div>
                <BankStatusBadge status={a.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-text-muted mb-3">
                <div><span className="text-text-secondary">Holder:</span> {a.account_holder_name}</div>
                <div><span className="text-text-secondary">IFSC:</span> <span className="font-mono">{a.ifsc}</span></div>
                <div><span className="text-text-secondary">Type:</span> {a.account_type}</div>
                <div><span className="text-text-secondary">Added:</span> {new Date(a.created_at).toLocaleDateString()}</div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                {a.status === "verified" && !a.is_primary && (
                  <Button size="sm" variant="outline" onClick={() => setPrimary(a.id)} className="text-xs h-7">Mark primary</Button>
                )}
                {a.status === "failed" && (
                  <Button size="sm" variant="outline" onClick={() => retry(a.id)} className="text-xs h-7 gap-1"><RefreshCw className="h-3 w-3" />Retry</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => removeAccount(a.id)} className="text-xs h-7 text-danger border-danger/30 hover:bg-danger-light gap-1 ml-auto">
                  <Trash2 className="h-3 w-3" />Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddBankModal open={open} onClose={() => setOpen(false)} onAdd={addAccount} />
    </div>
  );
}

function BankStatusBadge({ status }: { status: BankStatus }) {
  const map: Record<BankStatus, { label: string; cls: string }> = {
    pending:   { label: "Pending",   cls: "bg-surface-2 text-text-secondary border-border" },
    verifying: { label: "Verifying", cls: "bg-warning-light text-warning-dark border-warning/30" },
    verified:  { label: "Verified",  cls: "bg-success-light text-success-dark border-success/30" },
    failed:    { label: "Failed",    cls: "bg-danger-light text-danger-dark border-danger/30" },
  };
  const m = map[status];
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium border", m.cls)}>{m.label}</span>;
}

function AddBankModal({ open, onClose, onAdd }: {
  open: boolean; onClose: () => void;
  onAdd: (a: {
    account_holder_name: string;
    ifsc: string;
    bank_name: string;
    account_type: string;
    accountNumber: string;
  }) => Promise<void>;
}) {
  const [holder, setHolder] = useState("");
  const [acct, setAcct] = useState("");
  const [acct2, setAcct2] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bank, setBank] = useState("");
  const [type, setType] = useState("Savings");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setHolder(""); setAcct(""); setAcct2(""); setIfsc(""); setBank(""); setType("Savings"); setSubmitting(false); };

  const submit = async () => {
    if (!holder.trim()) { toast.error("Account holder name required"); return; }
    if (!/^\d{6,18}$/.test(acct.replace(/\s/g, ""))) { toast.error("Invalid account number"); return; }
    if (acct !== acct2) { toast.error("Account numbers do not match"); return; }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())) { toast.error("Invalid IFSC code"); return; }
    if (!bank.trim()) { toast.error("Bank name required"); return; }

    setSubmitting(true);
    try {
      await onAdd({
        account_holder_name: holder.trim(),
        ifsc: ifsc.toUpperCase(),
        bank_name: bank.trim(),
        account_type: type,
        accountNumber: acct.replace(/\s/g, ""),
      });
      reset();
      onClose();
    } catch {
      /* toast from caller */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add bank account</DialogTitle>
          <DialogDescription>We'll verify by sending ₹1 (penny drop). It usually takes a few minutes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Account holder name</Label><Input value={holder} onChange={e => setHolder(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Account number</Label><Input value={acct} onChange={e => setAcct(e.target.value.replace(/\D/g, ""))} className="font-mono" /></div>
            <div><Label>Confirm account number</Label><Input value={acct2} onChange={e => setAcct2(e.target.value.replace(/\D/g, ""))} className="font-mono" /></div>
          </div>
          <div><Label>IFSC code</Label><Input value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} placeholder="HDFC0001234" className="font-mono uppercase" maxLength={11} /></div>
          <div><Label>Bank name</Label><Input value={bank} onChange={e => setBank(e.target.value)} placeholder="HDFC Bank" /></div>
          <div>
            <Label>Account type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Savings">Savings</SelectItem>
                <SelectItem value="Current">Current</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-primary text-primary-foreground hover:bg-primary-dark">Add &amp; verify</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===========================================================
   LABEL LOGO TAB
=========================================================== */
function LabelLogoTab() {
  const [logoUrl, setLogoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewHost, setPreviewHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { logoUrl: url } = await labelInvoiceSettingsService.getMyLabelLogo();
        if (!cancelled) setLogoUrl(url || "");
      } catch {
        if (!cancelled) setLogoUrl("");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!previewHost) return;
    previewHost.replaceChildren();
    const settings = {
      ...DEFAULT_LABEL_INVOICE_SETTINGS,
      logoUrl: logoUrl || DEFAULT_LABEL_INVOICE_SETTINGS.logoUrl,
      showLogo: true,
      labelSize: "4x6" as const,
    };
    const node = createOrderLabelElement(getLabelPreviewSampleOrder(), settings, {
      documentTitle: "Preview",
    });
    node.style.transform = "scale(0.55)";
    node.style.transformOrigin = "top left";
    previewHost.appendChild(node);
  }, [logoUrl, previewHost]);

  const onFile = (file: File | null) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp|svg\+xml)$/i.test(file.type)) {
      toast.error("Upload a PNG, JPG, WEBP, or SVG image");
      return;
    }
    if (file.size > 900_000) {
      toast.error("Logo must be under 900 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const r = String(reader.result ?? "");
      if (r.startsWith("data:")) setLogoUrl(r);
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!logoUrl.trim()) {
      toast.error("Upload a logo first");
      return;
    }
    setSaving(true);
    try {
      const res = await labelInvoiceSettingsService.putMyLabelLogo(logoUrl.trim());
      setLogoUrl(res.logoUrl);
      toast.success("Label logo saved — it will appear on your shipping labels");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save logo");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await labelInvoiceSettingsService.deleteMyLabelLogo();
      setLogoUrl("");
      toast.success("Custom logo removed — labels will use the default ShipAmaze logo");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove logo");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted py-10 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading logo settings…
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-text-primary">Shipping label logo</h3>
          <p className="text-sm text-text-muted mt-1">
            Upload your brand logo. It replaces the default logo on labels for your orders only.
            Other dropshippers keep their own logos.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="h-16 w-40 rounded-lg border border-dashed border-border bg-surface-2 flex items-center justify-center overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Label logo" className="max-h-14 max-w-[150px] object-contain" />
            ) : (
              <span className="text-xs text-text-muted">No custom logo</span>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ds-label-logo" className="cursor-pointer inline-flex items-center gap-2 text-sm font-medium text-primary">
              <Upload className="h-4 w-4" /> Choose image
            </Label>
            <Input
              id="ds-label-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-text-muted">PNG / JPG / WEBP / SVG · max 900 KB</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()} disabled={saving || !logoUrl.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save logo
          </Button>
          <Button variant="outline" onClick={() => void remove()} disabled={saving || !logoUrl}>
            <Trash2 className="h-4 w-4 mr-2" /> Remove
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold text-text-primary mb-3">Label preview</h3>
        <div
          ref={setPreviewHost}
          className="overflow-hidden bg-surface-2 rounded-lg border border-border h-[320px]"
        />
      </div>
    </div>
  );
}

/* ===========================================================
   TEAM TAB
=========================================================== */
function mapTeamRow(row: Record<string, unknown>): TeamMember {
  const email = String(row.email ?? "");
  const local = (email.split("@")[0] || "member").replace(/[._-]+/g, " ");
  const name = String(row.fullName ?? row.full_name ?? local);
  return {
    id: String(row.id ?? ""),
    full_name: name.charAt(0).toUpperCase() + name.slice(1),
    email,
    role: String(row.role ?? "member"),
    permissions: (Array.isArray(row.permissions) ? (row.permissions as string[]) : []) as string[],
    status: (String(row.status ?? "invited") as MemberStatus) || "invited",
    invited_at: String(row.invited_at ?? row.invitedAt ?? new Date().toISOString()),
  };
}

function TeamTab({ userId }: { userId: string | null }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!userId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    try {
      const rows = (await dropshipperService.listTeamMembers()) as unknown[];
      setMembers((Array.isArray(rows) ? rows : []).map((r) => mapTeamRow(r as Record<string, unknown>)));
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [userId]);

  const addMember = async (m: Omit<TeamMember, "id" | "invited_at" | "status">) => {
    if (members.some((x) => x.email.toLowerCase() === m.email.toLowerCase())) {
      toast.error("This email is already invited");
      return;
    }
    if (!userId) {
      toast.error("Sign in required");
      return;
    }
    try {
      await dropshipperService.inviteTeamMember({ email: m.email, role: m.role });
      toast.success(`Invite sent to ${m.email}`);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to invite");
      throw e;
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this team member?")) return;
    try {
      await dropshipperService.removeTeamMember(id);
      toast.success("Member removed");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  };

  const resend = async (id: string) => {
    try {
      await dropshipperService.resendTeamInvite(id);
      toast.success("Invite resent");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to resend");
    }
  };

  const copyInvite = (m: TeamMember) => {
    const link = `${window.location.origin}/signup?invite=${m.id}&email=${encodeURIComponent(m.email)}`;
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied");
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-card shadow-card p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Team Members</h3>
            <p className="text-sm text-text-muted mt-0.5">Invite teammates and control what they can access.</p>
          </div>
          <Button onClick={() => setOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2">
            <Plus className="h-4 w-4" /> Invite member
          </Button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-text-muted">Loading…</div>
        ) : members.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-border rounded-xl">
            <Users2 className="h-10 w-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary font-medium">No team members yet</p>
            <p className="text-sm text-text-muted mt-1">Invite teammates to collaborate.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/50 text-left">
                  <th className="p-3 font-medium text-text-secondary">Member</th>
                  <th className="p-3 font-medium text-text-secondary">Role</th>
                  <th className="p-3 font-medium text-text-secondary">Permissions</th>
                  <th className="p-3 font-medium text-text-secondary">Status</th>
                  <th className="p-3 font-medium text-text-secondary text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-primary font-semibold text-sm">
                          {m.full_name.split(" ").map(s => s[0]).slice(0,2).join("").toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-text-primary">{m.full_name}</p>
                          <p className="text-xs text-text-muted">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3"><Badge variant="outline">{m.role}</Badge></td>
                    <td className="p-3">
                      {m.permissions.length === 0 ? (
                        <span className="text-xs text-text-muted">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {m.permissions.slice(0, 4).map((p) => (
                            <span key={p} className="rounded-full bg-surface-2 text-text-secondary text-[10px] px-2 py-0.5 border border-border">{p}</span>
                          ))}
                          {m.permissions.length > 4 && <span className="text-[10px] text-text-muted">+{m.permissions.length - 4}</span>}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium border",
                        m.status === "active" && "bg-success-light text-success-dark border-success/30",
                        m.status === "invited" && "bg-warning-light text-warning-dark border-warning/30",
                        m.status === "disabled" && "bg-surface-2 text-text-muted border-border"
                      )}>{m.status === "invited" ? "Invited" : m.status === "active" ? "Active" : "Disabled"}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1 justify-end">
                        {m.status === "invited" && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => copyInvite(m)} title="Copy invite"><Copy className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => resend(m.id)} title="Resend invite"><RefreshCw className="h-4 w-4" /></Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => remove(m.id)} title="Remove" className="text-danger hover:text-danger-dark hover:bg-danger-light">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Role Guide */}
      <div className="rounded-xl bg-card shadow-card p-6">
        <h4 className="font-semibold text-text-primary mb-1">Role guide</h4>
        <p className="text-sm text-text-muted mb-4">Quick reference for what each role can do by default.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { name: "Manager",    desc: "Full access to all panels except billing & KYC." },
            { name: "Operations", desc: "Process orders, manage shipments and NDRs." },
            { name: "Finance",    desc: "View payouts, request withdrawals, export reports." },
            { name: "Support",    desc: "Read-only across orders and shipments." },
          ].map(r => (
            <div key={r.name} className="rounded-xl border border-border p-4 hover:border-primary/30 transition-colors">
              <p className="font-semibold text-text-primary">{r.name}</p>
              <p className="text-xs text-text-muted mt-1">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <InviteModal open={open} onClose={() => setOpen(false)} onAdd={addMember} />
    </div>
  );
}

/* ===========================================================
   CHANNELS TAB
=========================================================== */
function ChannelsTab() {
  return (
    <div className="space-y-4">
      <ShopifyConnect />
    </div>
  );
}

function InviteModal({ open, onClose, onAdd }: {
  open: boolean; onClose: () => void;
  onAdd: (m: { full_name: string; email: string; role: string; permissions: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Operations");
  const [perms, setPerms] = useState<string[]>(["Orders", "Shipments"]);

  const reset = () => { setName(""); setEmail(""); setRole("Operations"); setPerms(["Orders", "Shipments"]); };

  const togglePerm = (p: string) => setPerms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const submit = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Invalid email"); return; }
    if (perms.length === 0) { toast.error("Select at least one permission"); return; }
    try {
      await onAdd({ full_name: name.trim(), email: email.trim().toLowerCase(), role, permissions: perms });
      reset();
      onClose();
    } catch {
      /* toast from caller */
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite team member</DialogTitle>
          <DialogDescription>They'll get an email invite to join your workspace.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Full name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2 block">Permissions</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_PERMISSIONS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePerm(p)}
                  className={cn("rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                    perms.includes(p)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-surface-2 text-text-secondary border-border hover:border-primary/40"
                  )}
                >{p}</button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={submit} className="bg-primary text-primary-foreground hover:bg-primary-dark">Send Invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
