import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Headphones } from "lucide-react";

export default function AdminSupport() {
  const tickets: unknown[] = [];

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Support Tickets" breadcrumb={["Admin", "Support"]} />
      {tickets.length === 0 ? (
        <EmptyState
          icon={Headphones}
          title="No support tickets"
          description="There are no support tickets in the system yet. This view will list tickets when a ticketing integration is available."
        />
      ) : null}
    </div>
  );
}
