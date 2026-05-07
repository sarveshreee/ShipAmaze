import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
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
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up w-full max-w-4xl">
      <PageHeader
        title="Profile"
        breadcrumb={[capitalizeRole(role), "Profile"]}
        className="mb-3"
      />
      <p className="mb-3 text-sm text-text-muted leading-snug">
        Update your details. Email and role cannot be changed here.
      </p>
      <Card className="p-4 sm:p-5 shadow-sm">
        <ProfileEditor user={user} onSaved={applyUser} />
      </Card>
    </div>
  );
}
