import { PageHeader } from "@/components/PageHeader";
import ShopifyConnect from "@/components/ShopifyConnect";

export default function AdminChannels() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Channel Connect" breadcrumb={["Admin", "Channels"]} />
      <div className="max-w-3xl">
        <ShopifyConnect />
      </div>
    </div>
  );
}
