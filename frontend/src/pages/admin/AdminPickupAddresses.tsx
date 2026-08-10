import PickupAddressesPanel from "@/components/PickupAddressesPanel";

export default function AdminPickupAddresses() {
  return (
    <PickupAddressesPanel
      breadcrumb={["Admin", "Pickup Addresses"]}
      subtitle="All pickup / warehouse addresses — platform (admin) and vendor addresses are shown here and available for order processing."
      showProviderBrand
    />
  );
}
