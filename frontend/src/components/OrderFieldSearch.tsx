import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ORDER_SEARCH_FIELD_OPTIONS } from "@/lib/orderListFilterUtils";
import type { OrderSearchField } from "@/services/orderService";

type Props = {
  searchField?: OrderSearchField;
  searchValue?: string;
  onChange: (field: OrderSearchField | undefined, value: string) => void;
  className?: string;
};

export function OrderFieldSearch({ searchField, searchValue, onChange, className }: Props) {
  const [field, setField] = useState<OrderSearchField>(searchField ?? "trackingId");
  const [value, setValue] = useState(searchValue ?? "");

  useEffect(() => {
    if (searchField) setField(searchField);
  }, [searchField]);

  useEffect(() => {
    setValue(searchValue ?? "");
  }, [searchValue]);

  const commit = (nextField: OrderSearchField, nextValue: string) => {
    const trimmed = nextValue.trim();
    if (!trimmed) {
      onChange(undefined, "");
      return;
    }
    onChange(nextField, nextValue);
  };

  return (
    <div
      className={cn(
        "flex min-w-[280px] flex-1 overflow-hidden rounded-lg border border-primary/20 bg-background/80 shadow-sm",
        className
      )}
    >
      <Select
        value={field}
        onValueChange={(v) => {
          const next = v as OrderSearchField;
          setField(next);
          commit(next, value);
        }}
      >
        <SelectTrigger
          className="h-10 w-[170px] shrink-0 rounded-none border-0 border-r border-border/60 bg-transparent text-sm focus:ring-0"
          aria-label="Search field"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-popover text-popover-foreground">
          {ORDER_SEARCH_FIELD_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea
        placeholder="Enter value(s) — one per line or comma-separated"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => commit(field, value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            commit(field, value);
          }
        }}
        rows={1}
        className="min-h-10 max-h-24 flex-1 resize-y rounded-none border-0 bg-transparent px-3 py-2 text-sm focus-visible:ring-0"
        aria-label="Search value"
      />
    </div>
  );
}
