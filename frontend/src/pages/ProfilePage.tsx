import { PageHeader } from "@/components/PageHeader";
import { ProfileEditor } from "@/components/ProfileEditor";
import { useAuth } from "@/contexts/AuthContext";

function capitalizeRole(r: string) {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

export default function ProfilePage() {
  const { user, applyUser, role, isLoading } = useAuth();

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up mx-auto max-w-5xl space-y-6 overflow-x-hidden">
      <PageHeader title="Profile" breadcrumb={[capitalizeRole(role), "Profile"]} />
      <p className="text-sm text-text-secondary">
        Manage your account details. Email and role are managed by your administrator.
      </p>
      <ProfileEditor user={user} onSaved={applyUser} layout="split" />
    </div>
  );
}
