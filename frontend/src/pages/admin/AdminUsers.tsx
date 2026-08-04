import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { CreateUserDialog } from "@/components/admin/CreateUserDialog";
import * as userService from "@/services/userService";
import type { AdminUserDetail, AdminUserRow } from "@/services/userService";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  UserPlus,
  Loader2,
  RefreshCw,
  Users,
  Eye,
  EyeOff,
  Copy,
  LogIn,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import type { UserRole } from "@/services/authService";
import { roleDashboardPath } from "@/services/authService";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  vendor: "Vendor",
  dropshipper: "Dropshipper",
};

function statusBadge(status: string) {
  if (status === "active") return <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Active</Badge>;
  if (status === "blocked") return <Badge variant="destructive">Blocked</Badge>;
  return <Badge variant="secondary">Inactive</Badge>;
}

function CredentialCell({
  value,
  reveal,
}: {
  value: string | null | undefined;
  reveal: boolean;
}) {
  if (!value) {
    return <span className="text-text-muted text-xs">Reset to view</span>;
  }
  return (
    <span className="font-mono text-xs tabular-nums">
      {reveal ? value : "••••••••"}
    </span>
  );
}

export default function AdminUsers() {
  const { startImpersonation, user: authUser } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [revealPasswords, setRevealPasswords] = useState(false);
  const [revealDetailPassword, setRevealDetailPassword] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await userService.adminListUsers({
        page: String(page),
        limit: String(limit),
        search: searchDebounced || undefined,
        role: roleFilter !== "all" ? roleFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setItems(r.items ?? []);
      setTotal(r.total ?? 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof ApiError ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchDebounced, roleFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      setNewPassword("");
      setRevealDetailPassword(false);
      return;
    }
    void (async () => {
      setDetailLoading(true);
      try {
        const r = await userService.adminGetUser(detailId);
        setDetail(r.user);
      } catch {
        setDetail(null);
        toast.error("Could not load user");
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [detailId]);

  const patchStatus = async (status: "active" | "inactive" | "blocked") => {
    if (!detailId) return;
    setSaving(true);
    try {
      await userService.adminPatchUser(detailId, { status });
      toast.success(`User ${status === "active" ? "activated" : status === "blocked" ? "blocked" : "deactivated"}`);
      await load();
      const r = await userService.adminGetUser(detailId);
      setDetail(r.user);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const patchDropshipperAccess = async (patch: {
    accessType?: "FULL" | "RESTRICTED";
    allowWarehouseAccess?: boolean;
  }) => {
    if (!detailId) return;
    setSaving(true);
    try {
      await userService.adminPatchUser(detailId, patch);
      toast.success("Access updated");
      await load();
      const r = await userService.adminGetUser(detailId);
      setDetail(r.user);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!detailId || !newPassword) {
      toast.error("Enter a new password");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setResetting(true);
    try {
      await userService.adminResetUserPassword(detailId, newPassword);
      toast.success("Password reset successfully");
      setNewPassword("");
      const r = await userService.adminGetUser(detailId);
      setDetail(r.user);
      setRevealDetailPassword(true);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Password reset failed");
    } finally {
      setResetting(false);
    }
  };

  const canLoginAsUser =
    !!detail &&
    detail.status === "active" &&
    detail.id !== authUser?.id &&
    (detail.role !== "admin" || !!authUser?.isOwnerAdmin);

  const handleLoginAsUser = async () => {
    if (!detail || !canLoginAsUser) return;
    setImpersonatingId(detail.id);
    try {
      const res = await userService.adminImpersonateUser(detail.id);
      if (!res.success || !res.token || !res.user) {
        throw new Error("Invalid impersonation response");
      }
      startImpersonation(res.token, res.user);
      setDetailId(null);
      toast.success(`Now viewing as ${res.user.name}`);
      navigate(roleDashboardPath(res.user.role), { replace: true });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Impersonation failed");
    } finally {
      setImpersonatingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="User management"
        breadcrumb={["Admin", "Users"]}
        actions={
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2"
            onClick={() => setCreateOpen(true)}
          >
            <UserPlus className="h-4 w-4" />
            Create user
          </Button>
        }
      />

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void load()}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            className="pl-9"
            placeholder="Search name, email, company, phone…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(v) => {
            setRoleFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="vendor">Vendor</SelectItem>
            <SelectItem value="dropshipper">Dropshipper</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setRevealPasswords((v) => !v)}
        >
          {revealPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {revealPasswords ? "Hide passwords" : "Show passwords"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-text-muted">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading users…
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No users found"
            description="Create a user or adjust your filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-text-muted">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Password</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Phone</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Role</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Company</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setDetailId(u.id)}
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">{u.name}</td>
                    <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <CredentialCell value={u.password} reveal={revealPasswords} />
                        {u.password ? (
                          <button
                            type="button"
                            className="text-text-muted hover:text-text-primary"
                            title="Copy password"
                            onClick={() => {
                              void navigator.clipboard.writeText(u.password!);
                              toast.success("Password copied");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-text-muted">{u.phone || "—"}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge variant="outline">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-text-muted">{u.companyName || "—"}</td>
                    <td className="px-4 py-3">{statusBadge(u.status)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-text-muted">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > limit && (
        <div className="mt-4 flex items-center justify-between text-sm text-text-muted">
          <span>
            Page {page} of {totalPages} ({total} users)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>User details</SheetTitle>
          </SheetHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
            </div>
          ) : detail ? (
            <div className="mt-6 space-y-6">
              <div className="space-y-1">
                <p className="text-lg font-semibold text-text-primary">{detail.name}</p>
                <p className="text-sm text-text-muted">{detail.email}</p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge variant="outline">{ROLE_LABELS[detail.role]}</Badge>
                  {statusBadge(detail.status)}
                </div>
              </div>

              <div className="grid gap-3 text-sm">
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <p className="text-sm font-medium">Login credentials</p>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-text-muted">Email: </span>
                      <span className="font-mono text-xs">{detail.email}</span>
                    </div>
                    <button
                      type="button"
                      className="text-text-muted hover:text-text-primary"
                      onClick={() => {
                        void navigator.clipboard.writeText(detail.email);
                        toast.success("Email copied");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-text-muted">Password: </span>
                      <CredentialCell value={detail.password} reveal={revealDetailPassword} />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        className="text-text-muted hover:text-text-primary"
                        onClick={() => setRevealDetailPassword((v) => !v)}
                      >
                        {revealDetailPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      {detail.password ? (
                        <button
                          type="button"
                          className="text-text-muted hover:text-text-primary"
                          onClick={() => {
                            void navigator.clipboard.writeText(detail.password!);
                            toast.success("Password copied");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {!detail.password ? (
                    <p className="text-xs text-text-muted">
                      No recoverable password on file. Use Reset password below to set one you can view.
                    </p>
                  ) : null}
                </div>
                {detail.phone && (
                  <div>
                    <span className="text-text-muted">Phone: </span>
                    <span>{detail.phone}</span>
                  </div>
                )}
                {detail.companyName && (
                  <div>
                    <span className="text-text-muted">Company: </span>
                    <span>{detail.companyName}</span>
                  </div>
                )}
                <div>
                  <span className="text-text-muted">Email verified: </span>
                  <span>{detail.emailVerified ? "Yes" : "No"}</span>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-4">
                <p className="text-sm font-medium">Account status</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={detail.status === "active" ? "default" : "outline"}
                    disabled={saving || detail.status === "active"}
                    onClick={() => void patchStatus("active")}
                  >
                    Activate
                  </Button>
                  <Button
                    size="sm"
                    variant={detail.status === "inactive" ? "secondary" : "outline"}
                    disabled={saving || detail.status === "inactive"}
                    onClick={() => void patchStatus("inactive")}
                  >
                    Deactivate
                  </Button>
                  <Button
                    size="sm"
                    variant={detail.status === "blocked" ? "destructive" : "outline"}
                    disabled={saving || detail.status === "blocked"}
                    onClick={() => void patchStatus("blocked")}
                  >
                    Block
                  </Button>
                </div>
              </div>

              {canLoginAsUser && (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/[0.04] p-4">
                  <p className="text-sm font-medium">Impersonation</p>
                  <p className="text-xs text-text-muted">
                    Open the app as this user without their password. Your admin session is preserved so you can return anytime.
                  </p>
                  <Button
                    size="sm"
                    className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary-dark"
                    disabled={impersonatingId === detail.id}
                    onClick={() => void handleLoginAsUser()}
                  >
                    {impersonatingId === detail.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogIn className="h-4 w-4" />
                    )}
                    Login as User
                  </Button>
                </div>
              )}
              {!canLoginAsUser && detail.status !== "active" && (
                <p className="text-xs text-text-muted">Activate this user before using Login as User.</p>
              )}
              {!canLoginAsUser && detail.role === "admin" && !authUser?.isOwnerAdmin && (
                <p className="text-xs text-text-muted">Only a Super Admin can impersonate another admin.</p>
              )}

              {detail.role === "dropshipper" && detail.dropshipper && (
                <div className="space-y-3 rounded-lg border border-border p-4">
                  <p className="text-sm font-medium">Dropshipper access</p>
                  <div className="space-y-2">
                    <Label>Access type</Label>
                    <Select
                      value={detail.dropshipper.accessType}
                      onValueChange={(v) =>
                        void patchDropshipperAccess({ accessType: v as "FULL" | "RESTRICTED" })
                      }
                      disabled={saving}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FULL">Full access</SelectItem>
                        <SelectItem value="RESTRICTED">Restricted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Warehouse access</Label>
                    <Switch
                      checked={detail.dropshipper.allowWarehouseAccess}
                      onCheckedChange={(v) => void patchDropshipperAccess({ allowWarehouseAccess: v })}
                      disabled={saving}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-3 rounded-lg border border-border p-4">
                <p className="text-sm font-medium">Reset password</p>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="New password (min. 8 chars)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={resetting || !newPassword}
                  onClick={() => void handleResetPassword()}
                >
                  {resetting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Reset password
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
