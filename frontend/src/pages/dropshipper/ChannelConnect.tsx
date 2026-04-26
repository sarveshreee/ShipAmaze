import { PageHeader } from "@/components/PageHeader";
import ShopifyConnect from "@/components/ShopifyConnect";

export default function ChannelConnect() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Channel Connect" breadcrumb={["Dropshipper", "Channels"]} />
      <div className="max-w-3xl">
        <ShopifyConnect />
      </div>
    </div>
  );
}
