import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import * as dropshipperService from "@/services/dropshipperService";
import {
  CheckCircle2, Clock, AlertCircle,
  Upload, FileCheck, X, User, Briefcase, Loader2
} from "lucide-react";

type AccountType = "individual" | "company";
type KycStatus = "draft" | "pending" | "verified" | "rejected";

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

function StatusPill({ status }: { status: KycStatus }) {
  const map: Record<KycStatus, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
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

function FileUploadField({ label, value, onChange }: { label: string; value?: string; onChange: (dataUrl: string | undefined) => void }) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > KYC_MAX_FILE_BYTES) { toast.error("File too large (max 2MB)"); return; }
    if (!/\.(jpg|jpeg|png|webp)$/i.test(f.name) && !f.type.startsWith("image/")) {
      toast.error("Only JPG/PNG/WEBP images allowed");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { onChange(String(reader.result ?? "")); toast.success(`${f.name} uploaded`); };
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
              <button type="button" onClick={() => openKycDocument(value, label)} className="text-sm text-success-dark truncate hover:underline text-left">
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
  return {
    ...(data as unknown as KycProfile),
    account_type: (data.account_type as AccountType) || "individual",
    status: (data.status as KycStatus) || "draft",
    uploaded_docs: cleanKycDocs(data.uploaded_docs ?? data.documents),
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
      if (!userId) { setLoading(false); return; }
      try {
        const data = (await dropshipperService.getKyc()) as Record<string, unknown>;
        if (data && Object.keys(data).length) setProfile(mapApiKyc(data));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to load KYC");
      } finally { setLoading(false); }
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
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
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
    }
    if (!profile.address) errs.push("Address");
    if (errs.length) { toast.error(`Missing: ${errs.join(", ")}`); return; }
    setSubmitting(true);
    try {
      const saved = await dropshipperService.submitKyc({
        ...profile,
        uploaded_docs: profile.uploaded_docs,
        documents: profile.uploaded_docs,
        termsAccepted: true,
      } as unknown as Record<string, unknown>) as Record<string, unknown>;
      if (saved && typeof saved === "object") setProfile(mapApiKyc(saved));
      else setProfile(p => ({ ...p, status: "pending" as KycStatus, rejectionRemark: "" }));
      toast.success("Submitted for admin approval");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Submit failed"); }
    finally { setSubmitting(false); }
  };

  const isLocked = profile.status === "pending" || profile.status === "verified";

  const checklist = useMemo(() => [
    { label: "Email verified", done: true },
    { label: "KYC documents", done: profile.status === "verified" || profile.status === "pending" },
    { label: "GST (optional)", done: !!profile.gst_number, optional: true },
  ], [profile]);

  if (loading) return <div className="rounded-xl bg-card shadow-card p-12 text-center text-text-muted">Loading…</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
      <div className="rounded-xl bg-card shadow-card p-6 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">KYC Verification</h3>
            <p className="text-sm text-text-muted mt-0.5">Required before you can access all vendor features.</p>
          </div>
          <StatusPill status={profile.status} />
        </div>

        {profile.status === "pending" && <KycPendingBanner />}
        {profile.status === "rejected" && <KycRejectedBanner remark={profile.rejectionRemark} />}

        <div>
          <Label className="mb-2 block">Account Type</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { key: "individual", icon: User, title: "Individual", sub: "Sole proprietor using PAN & Aadhaar." },
              { key: "company", icon: Briefcase, title: "Company", sub: "Pvt Ltd, LLP, or Partnership with GST & CIN." },
            ] as const).map(opt => {
              const active = profile.account_type === opt.key;
              const Icon = opt.icon;
              return (
                <button key={opt.key} type="button" disabled={isLocked} onClick={() => update({ account_type: opt.key })}
                  className={cn("rounded-xl border-2 p-4 text-left transition-all flex gap-3 items-start",
                    active ? "border-primary bg-primary-light" : "border-border bg-surface-2/40 hover:border-primary/40",
                    isLocked && "opacity-60 cursor-not-allowed"
                  )}>
                  <span className={cn("flex h-5 w-5 mt-0.5 items-center justify-center rounded-full border-2 shrink-0", active ? "border-primary" : "border-border")}>
                    {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium text-text-primary"><Icon className="h-4 w-4" />{opt.title}</div>
                    <p className="text-xs text-text-muted mt-1">{opt.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

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
            KYC is mandatory to activate your vendor account and start receiving orders.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VendorSettings() {
  const { userId } = useAuth();

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Vendor Settings" breadcrumb={["Vendor", "Settings"]} />
      <p className="-mt-3 mb-5 text-sm text-text-muted">Manage your KYC and account settings.</p>
      <KycTab userId={userId} />
    </div>
  );
}
