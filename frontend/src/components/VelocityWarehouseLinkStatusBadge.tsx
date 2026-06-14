import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getVelocityWarehouseLinkStatus,
  VELOCITY_LINK_STATUS_LABEL,
  type VelocityWarehouseLinkStatus,
} from "@/lib/velocityWarehouseLink";

const STATUS_STYLES: Record<VelocityWarehouseLinkStatus, string> = {
  linked: "border-success/40 bg-success-light text-success-dark",
  not_linked: "border-warning/40 bg-warning-light text-warning-dark",
  invalid: "border-danger/40 bg-danger-light text-danger",
};

type Props = {
  velocityWarehouseId?: string;
  className?: string;
};

export function VelocityWarehouseLinkStatusBadge({ velocityWarehouseId, className }: Props) {
  const status = getVelocityWarehouseLinkStatus(velocityWarehouseId);
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-medium px-2 py-0 h-5", STATUS_STYLES[status], className)}
    >
      {VELOCITY_LINK_STATUS_LABEL[status]}
    </Badge>
  );
}
