import PickupAddressesPanel from "@/components/PickupAddressesPanel";

export default function AdminPickupAddresses() {
  return (
    <PickupAddressesPanel
      breadcrumb={["Admin", "Pickup Addresses"]}
      subtitle="Manage platform pickup / warehouse locations for admin orders and shipments."
    />
  );
}
