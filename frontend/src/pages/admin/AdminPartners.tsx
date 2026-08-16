import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Eye,
  Ban,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/apiClient";
import * as partnerService from "@/services/partnerService";
import type { AdminPartnerKeyRow, AdminPartnerRow } from "@/services/partnerService";
import type { PartnerStatus } from "@/services/partnerService";
import { CreatePartnerDialog } from "@/components/admin/CreatePartnerDialog";
import { PartnerApiKeyCreatedDialog } from "@/components/admin/PartnerApiKeyCreatedDialog";

function partnerStatusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: "bg-success-light/60 text-success-dark border-success/40",
    SUSPENDED: "bg-warning-light/60 text-warning-dark border-warning/40",
    DISABLED: "bg-danger-light/60 text-danger-dark border-danger/40",
  };
  return (
    <Badge variant="outline" className={cn(map[status] ?? "bg-surface-2 text-text-secondary")}>
      {status}
    </Badge>
  );
}

function keyStatusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: "bg-success-light/60 text-success-dark border-success/40",
    REVOKED: "bg-danger-light/60 text-danger-dark border-danger/40",
    EXPIRED: "bg-surface-2 text-text-secondary border-border",
  };
  return (
    <Badge variant="outline" className={cn(map[status] ?? "bg-surface-2 text-text-secondary")}>
      {status}
    </Badge>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";
  try {
    return format(new Date(value), "PP p");
  } catch {
    return value;
  }
}

export default function AdminPartners() {
  const [partners, setPartners] = useState<AdminPartnerRow[]>([]);
  const [walletBillingEnabled, setWalletBillingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [createOpen, setCreateOpen] = useState(false);

  const [detailPartner, setDetailPartner] = useState<AdminPartnerRow | null>(null);
  const [keys, setKeys] = useState<AdminPartnerKeyRow[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keyActionLoading, setKeyActionLoading] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<AdminPartnerKeyRow | null>(null);

  const [keyCreatedOpen, setKeyCreatedOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createdKeyPrefix, setCreatedKeyPrefix] = useState<string | null>(null);
  const [createdKeyWarning, setCreatedKeyWarning] = useState<string | undefined>();

  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState<PartnerStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await partnerService.listPartners();
      setPartners(r.partners);
      setWalletBillingEnabled(r.walletBillingEnabled);
    } catch (e) {
      setPartners([]);
      setError(e instanceof ApiError ? e.message : "Failed to load partners");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadKeys = useCallback(async (partnerId: string) => {
    setKeysLoading(true);
    try {
      const rows = await partnerService.listPartnerKeys(partnerId);
      setKeys(rows);
    } catch (e) {
      setKeys([]);
      toast.error(e instanceof ApiError ? e.message : "Failed to load API keys");
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!detailPartner) {
      setKeys([]);
      return;
    }
    void loadKeys(detailPartner.id);
  }, [detailPartner, loadKeys]);

  const filtered = useMemo(() => {
    if (!deferredSearch) return partners;
    return partners.filter((p) => {
      const linked = p.linkedUser;
      return (
        p.name.toLowerCase().includes(deferredSearch) ||
        p.id.toLowerCase().includes(deferredSearch) ||
        (linked?.name ?? "").toLowerCase().includes(deferredSearch) ||
        (linked?.email ?? "").toLowerCase().includes(deferredSearch)
      );
    });
  }, [partners, deferredSearch]);

  const openDetail = (partner: AdminPartnerRow) => {
    setDetailPartner(partner);
  };

  const refreshDetailPartner = async () => {
    const r = await partnerService.listPartners();
    setPartners(r.partners);
    setWalletBillingEnabled(r.walletBillingEnabled);
    if (detailPartner) {
      const updated = r.partners.find((p) => p.id === detailPartner.id);
      if (updated) setDetailPartner(updated);
    }
  };

  const handleGenerateKey = async () => {
    if (!detailPartner) return;
    setKeyActionLoading(true);
    try {
      const result = await partnerService.createPartnerKey(detailPartner.id);
      setCreatedKey(result.key);
      setCreatedKeyPrefix(result.keyPrefix);
      setCreatedKeyWarning(result.warning);
      setKeyCreatedOpen(true);
      await loadKeys(detailPartner.id);
      await refreshDetailPartner();
      toast.success("API key generated");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to generate API key");
    } finally {
      setKeyActionLoading(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!detailPartner || !revokeTarget) return;
    setKeyActionLoading(true);
    try {
      await partnerService.revokePartnerKey(detailPartner.id, revokeTarget.id);
      toast.success("API key revoked");
      setRevokeTarget(null);
      await loadKeys(detailPartner.id);
      await refreshDetailPartner();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to revoke API key");
    } finally {
      setKeyActionLoading(false);
    }
  };

  const handleKeyCreatedClose = (open: boolean) => {
    if (!open) {
      setCreatedKey(null);
      setCreatedKeyPrefix(null);
      setCreatedKeyWarning(undefined);
    }
    setKeyCreatedOpen(open);
  };

  const handleStatusChange = async () => {
    if (!detailPartner || !statusConfirm) return;
    setStatusActionLoading(true);
    try {
      await partnerService.updatePartnerStatus(detailPartner.id, statusConfirm);
      toast.success(
        statusConfirm === "ACTIVE"
          ? "Partner activated"
          : statusConfirm === "SUSPENDED"
            ? "Partner suspended"
            : "Partner disabled"
      );
      setStatusConfirm(null);
      await refreshDetailPartner();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to update partner status");
    } finally {
      setStatusActionLoading(false);
    }
  };

  const statusConfirmLabel =
    statusConfirm === "ACTIVE"
      ? "Activate partner?"
      : statusConfirm === "SUSPENDED"
        ? "Suspend partner?"
        : "Disable partner?";

  const statusConfirmDescription =
    statusConfirm === "ACTIVE"
      ? "Partner API keys will be able to authenticate again."
      : statusConfirm === "SUSPENDED"
        ? "All Partner API keys will be rejected immediately until the partner is reactivated."
        : "All Partner API keys will be rejected immediately. Use disable for permanent deactivation.";

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Partner API"
        breadcrumb={["Admin", "Partner API"]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Create Partner
            </Button>
          </div>
        }
      />

      <CreatePartnerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        walletBillingEnabled={walletBillingEnabled}
        onCreated={() => void load()}
      />

      <PartnerApiKeyCreatedDialog
        open={keyCreatedOpen}
        onOpenChange={handleKeyCreatedClose}
        apiKey={createdKey}
        keyPrefix={createdKeyPrefix}
        warning={createdKeyWarning}
      />

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
            <AlertDialogDescription>
              Revoking this key will immediately prevent applications using it from accessing the
              Partner API. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={keyActionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-foreground hover:bg-danger/90"
              onClick={(e) => {
                e.preventDefault();
                void handleRevokeKey();
              }}
              disabled={keyActionLoading}
            >
              {keyActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Revoke key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!statusConfirm} onOpenChange={(o) => !o && setStatusConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{statusConfirmLabel}</AlertDialogTitle>
            <AlertDialogDescription>{statusConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusActionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                statusConfirm === "ACTIVE"
                  ? "bg-primary text-primary-foreground hover:bg-primary-dark"
                  : "bg-danger text-danger-foreground hover:bg-danger/90"
              }
              onClick={(e) => {
                e.preventDefault();
                void handleStatusChange();
              }}
              disabled={statusActionLoading}
            >
              {statusActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mb-6 rounded-lg border border-border bg-surface-1 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" />
          <div className="space-y-2 text-sm text-text-secondary">
            <p className="font-medium text-text-primary">External Partner API integration</p>
            <p>
              External websites can use a generated Partner API key to access ShipAmaze courier
              services on behalf of the linked ShipAmaze user. The Partner API does not have a
              separate wallet — billing uses the linked user&apos;s existing ShipAmaze wallet when
              server wallet billing is enabled.
            </p>
            <p>
              <span className="font-medium">Supported operations:</span> serviceability, rates,
              shipment booking, tracking, and cancellation.
            </p>
            <p className="text-text-muted">
              Labels, outbound webhooks, and pickup creation are not available via the Partner API
              in the current release.
            </p>
            {walletBillingEnabled && (
              <p className="text-warning-dark">
                Wallet billing is currently <strong>enabled</strong> on the server. New partners
                must be linked to a dropshipper user.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            className="pl-9"
            placeholder="Search partner name, email, or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-light/20 p-3 text-sm text-danger-dark">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading partners…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No partners yet"
          description="Create a partner to issue API keys for external integrations."
          actionLabel="Create Partner"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Partner</th>
                <th className="px-4 py-3 font-medium">Linked user</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Wallet billing</th>
                <th className="px-4 py-3 font-medium">API keys</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-surface-1/50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-text-muted font-mono">{p.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    {p.linkedUser ? (
                      <div>
                        <div>{p.linkedUser.name}</div>
                        <div className="text-xs text-text-muted">{p.linkedUser.email}</div>
                        <div className="text-xs text-text-muted">{p.linkedUser.role}</div>
                      </div>
                    ) : (
                      <span className="text-text-muted font-mono text-xs">{p.linkedUserId}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{partnerStatusBadge(p.status)}</td>
                  <td className="px-4 py-3">
                    {walletBillingEnabled
                      ? p.linkedUser?.role === "dropshipper"
                        ? <Badge variant="outline" className="bg-success-light/40">Eligible</Badge>
                        : <Badge variant="outline" className="bg-warning-light/40">Not dropshipper</Badge>
                      : <Badge variant="outline">Server billing off</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{p.activeKeyCount ?? 0}</span>
                    <span className="text-text-muted"> active</span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openDetail(p)}>
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!detailPartner} onOpenChange={(o) => !o && setDetailPartner(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detailPartner && (
            <>
              <SheetHeader>
                <SheetTitle>{detailPartner.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-text-primary">Partner information</h3>
                  <dl className="grid gap-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-text-muted">Partner ID</dt>
                      <dd className="font-mono text-xs">{detailPartner.id}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-text-muted">Status</dt>
                      <dd>{partnerStatusBadge(detailPartner.status)}</dd>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {detailPartner.status !== "ACTIVE" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={statusActionLoading}
                          onClick={() => setStatusConfirm("ACTIVE")}
                        >
                          Enable
                        </Button>
                      )}
                      {detailPartner.status !== "SUSPENDED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-warning-dark border-warning/40"
                          disabled={statusActionLoading}
                          onClick={() => setStatusConfirm("SUSPENDED")}
                        >
                          Suspend
                        </Button>
                      )}
                      {detailPartner.status !== "DISABLED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-danger border-danger/30"
                          disabled={statusActionLoading}
                          onClick={() => setStatusConfirm("DISABLED")}
                        >
                          Disable
                        </Button>
                      )}
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-text-muted">Created</dt>
                      <dd>{formatDate(detailPartner.createdAt)}</dd>
                    </div>
                    {detailPartner.allowedProviders?.length && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-text-muted">Providers</dt>
                        <dd className="text-right">{detailPartner.allowedProviders.join(", ")}</dd>
                      </div>
                    )}
                  </dl>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-text-primary">Linked user</h3>
                  {detailPartner.linkedUser ? (
                    <dl className="grid gap-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-text-muted">Name</dt>
                        <dd>{detailPartner.linkedUser.name}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-text-muted">Email</dt>
                        <dd>{detailPartner.linkedUser.email}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-text-muted">Role</dt>
                        <dd>{detailPartner.linkedUser.role}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-text-muted">User ID</dt>
                        <dd className="font-mono text-xs">{detailPartner.linkedUser.id}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="text-sm text-text-muted font-mono">{detailPartner.linkedUserId}</p>
                  )}
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-text-primary">Wallet billing</h3>
                  <div className="rounded-md border border-border bg-surface-1 p-3 text-sm text-text-secondary space-y-2">
                    <p>
                      Server wallet billing:{" "}
                      <strong>{walletBillingEnabled ? "Enabled" : "Disabled"}</strong>
                    </p>
                    <p>
                      Partner shipments use the linked ShipAmaze user&apos;s existing wallet (not a
                      separate Partner wallet). When billing is enabled, Lorrigo and Ekart bookings
                      debit after successful booking; Velocity uses its existing wallet flow.
                    </p>
                    {walletBillingEnabled && detailPartner.linkedUser?.role !== "dropshipper" && (
                      <p className="text-warning-dark">
                        This partner is linked to a non-dropshipper user. New bookings may not
                        debit the wallet until linked to a dropshipper.
                      </p>
                    )}
                    <p className="text-text-muted">
                      Cancellation does not automatically refund the wallet in the current release.
                    </p>
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-text-primary">API keys</h3>
                    <Button
                      size="sm"
                      onClick={() => void handleGenerateKey()}
                      disabled={keyActionLoading}
                    >
                      {keyActionLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-1" />
                          Generate key
                        </>
                      )}
                    </Button>
                  </div>
                  {keysLoading ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-text-muted">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading keys…
                    </div>
                  ) : keys.length === 0 ? (
                    <p className="text-sm text-text-muted py-2">No API keys yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {keys.map((k) => (
                        <div
                          key={k.id}
                          className="rounded-md border border-border p-3 text-sm space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono">{k.keyPrefix}…</span>
                            {keyStatusBadge(k.status)}
                          </div>
                          {k.name && (
                            <p className="text-text-muted">Name: {k.name}</p>
                          )}
                          <p className="text-xs text-text-muted">
                            Created {formatDate(k.createdAt)}
                            {k.lastUsedAt && ` · Last used ${formatDate(k.lastUsedAt)}`}
                            {k.revokedAt && ` · Revoked ${formatDate(k.revokedAt)}`}
                          </p>
                          {k.scopes?.length > 0 && (
                            <p className="text-xs text-text-muted">
                              Scopes: {k.scopes.join(", ")}
                            </p>
                          )}
                          {k.status === "ACTIVE" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-danger border-danger/30 hover:bg-danger-light/30"
                              onClick={() => setRevokeTarget(k)}
                              disabled={keyActionLoading}
                            >
                              <Ban className="h-3 w-3 mr-1" />
                              Revoke
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-2 text-sm text-text-muted">
                  <h3 className="text-sm font-semibold text-text-primary">Usage & audit</h3>
                  <p>
                    Partner API request audit logs are recorded server-side. Detailed usage analytics
                    are not exposed in this admin view yet.
                  </p>
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
