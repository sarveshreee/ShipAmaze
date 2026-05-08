import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus, Users2, Trash2, RefreshCw, Copy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import * as dropshipperService from "@/services/dropshipperService";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type MemberStatus = "invited" | "active" | "disabled";

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  permissions: string[];
  status: MemberStatus;
  invited_at: string;
}

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

export default function VendorTeam() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    if (!userId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
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

  const invite = async () => {
    const email = inviteEmail.trim();
    if (!email) {
      toast.error("Email is required");
      return;
    }
    if (members.some((x) => x.email.toLowerCase() === email.toLowerCase())) {
      toast.error("This email is already invited");
      return;
    }
    setInviting(true);
    try {
      await dropshipperService.inviteTeamMember({ email, role: inviteRole });
      toast.success(`Invite recorded for ${email}`);
      setOpen(false);
      setInviteEmail("");
      setInviteRole("member");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to invite");
    } finally {
      setInviting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this team member invite?")) return;
    try {
      await dropshipperService.removeTeamMember(id);
      toast.success("Removed");
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
    void navigator.clipboard.writeText(link);
    toast.success("Invite link copied");
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Team management"
        breadcrumb={["Vendor", "Team"]}
        actions={
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Invite member
          </Button>
        }
      />

      <div className="rounded-xl bg-card shadow-card p-6 border border-border">
        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-text-muted">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading team…
          </div>
        ) : members.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-border rounded-xl">
            <Users2 className="h-10 w-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary font-medium">No team members yet</p>
            <p className="text-sm text-text-muted mt-1">Invite teammates to collaborate on this vendor account.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-surface-2/50 text-left">
                  <th className="p-3 font-medium text-text-secondary">Member</th>
                  <th className="p-3 font-medium text-text-secondary">Role</th>
                  <th className="p-3 font-medium text-text-secondary">Status</th>
                  <th className="p-3 font-medium text-text-secondary text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-primary font-semibold text-sm">
                          {m.full_name
                            .split(" ")
                            .map((s) => s[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-text-primary">{m.full_name}</p>
                          <p className="text-xs text-text-muted">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">{m.role}</Badge>
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium border",
                          m.status === "active" && "bg-success-light text-success-dark border-success/30",
                          m.status === "invited" && "bg-warning-light text-warning-dark border-warning/30",
                          m.status === "disabled" && "bg-surface-2 text-text-muted border-border"
                        )}
                      >
                        {m.status === "invited" ? "Invited" : m.status === "active" ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1 justify-end">
                        {m.status === "invited" && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => copyInvite(m)} title="Copy invite">
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void resend(m.id)} title="Resend">
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void remove(m.id)}
                          title="Remove"
                          className="text-danger hover:text-danger-dark hover:bg-danger-light"
                        >
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="vendor-team-email">Email</Label>
              <Input
                id="vendor-team-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">member</SelectItem>
                  <SelectItem value="manager">manager</SelectItem>
                  <SelectItem value="operations">operations</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-text-muted mt-2">
                Roles are labels for your workflow; they do not grant ShipAmaze admin access.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void invite()} disabled={inviting}>
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
