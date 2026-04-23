import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, Filter, Plus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Warehouse as WarehouseIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useVendorWarehouses, type Warehouse } from "@/hooks/useVendorWarehouses";
import WarehouseFormModal from "@/components/vendor/WarehouseFormModal";
import { toast } from "sonner";

export default function VendorWarehouse() {
  const { warehouses, loading, addWarehouse, updateWarehouse } = useVendorWarehouses();

  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ contactPerson: "", status: "all", warehouseType: "all", city: "" });
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);

  const filtered = useMemo(() => {
    return warehouses.filter((w) => {
      if (appliedSearch && !w.warehouseName.toLowerCase().includes(appliedSearch.toLowerCase())) return false;
      if (appliedFilters.contactPerson && !w.contactPerson.toLowerCase().includes(appliedFilters.contactPerson.toLowerCase())) return false;
      if (appliedFilters.status !== "all" && w.status !== appliedFilters.status) return false;
      if (appliedFilters.warehouseType !== "all" && w.warehouseType !== appliedFilters.warehouseType) return false;
      if (appliedFilters.city && !w.city.toLowerCase().includes(appliedFilters.city.toLowerCase())) return false;
      return true;
    });
  }, [warehouses, appliedSearch, appliedFilters]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  const apply = () => {
    setAppliedSearch(search);
    setAppliedFilters(filters);
    setPage(1);
  };
  const reset = () => {
    setSearch("");
    const f = { contactPerson: "", status: "all", warehouseType: "all", city: "" };
    setFilters(f);
    setAppliedSearch("");
    setAppliedFilters(f);
    setPage(1);
  };

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (w: Warehouse) => { setEditing(w); setModalOpen(true); };

  const handleSubmit = (data: Omit<Warehouse, "id" | "vendorId" | "vendorName" | "createdAt" | "updatedAt">) => {
    if (editing) updateWarehouse(editing.id, data);
    else addWarehouse(data);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Warehouse"
        breadcrumb={["Vendor", "Warehouse"]}
        actions={
          <Button variant="outline" onClick={() => setShowFilters((s) => !s)}>
            <Filter className="h-4 w-4" /> Filters
          </Button>
        }
      />

      {showFilters && (
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Input placeholder="Search by Warehouse Name" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Input placeholder="Contact Person" value={filters.contactPerson} onChange={(e) => setFilters((f) => ({ ...f, contactPerson: e.target.value }))} />
            <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.warehouseType} onValueChange={(v) => setFilters((f) => ({ ...f, warehouseType: v }))}>
              <SelectTrigger><SelectValue placeholder="Warehouse Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="B2B Warehouse">B2B Warehouse</SelectItem>
                <SelectItem value="B2C Warehouse">B2C Warehouse</SelectItem>
                <SelectItem value="Fulfillment Center">Fulfillment Center</SelectItem>
                <SelectItem value="Returns Warehouse">Returns Warehouse</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="City" value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={reset}>Reset</Button>
            <Button variant="outline" className="text-green-600 hover:text-green-600 border-green-600/40" onClick={apply}>Apply</Button>
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b bg-muted/30">
          <Badge variant="outline" className="text-primary border-primary/40">Total : {total}</Badge>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Warehouse
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Warehouse Name</TableHead>
                <TableHead>Contact Person Name</TableHead>
                <TableHead>Phone Number</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Warehouse Type</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                        <WarehouseIcon className="h-7 w-7 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">No warehouses found</p>
                        <p className="text-sm text-muted-foreground">Add your first warehouse to start shipping</p>
                      </div>
                      <Button onClick={openAdd}><Plus className="h-4 w-4" /> Add Warehouse</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">
                      {w.warehouseName}
                      {w.isDefault && <Badge variant="secondary" className="ml-2 text-xs">Default</Badge>}
                    </TableCell>
                    <TableCell>{w.contactPerson}</TableCell>
                    <TableCell>+91 {w.phoneNumber}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={w.email}>{w.email}</TableCell>
                    <TableCell className="max-w-[260px] whitespace-pre-wrap text-sm leading-relaxed">
                      {[w.addressLine1, w.addressLine2, w.landmark, `${w.city}, ${w.state}`, w.pincode, w.country]
                        .filter(Boolean).join("\n")}
                    </TableCell>
                    <TableCell>{w.warehouseType}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => openEdit(w)}>Edit</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-4 p-4 border-t bg-muted/20 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="text-muted-foreground">
            {total === 0 ? "0-0 of 0" : `${start + 1}-${Math.min(start + pageSize, total)} of ${total}`}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" disabled={currentPage === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" disabled={currentPage === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" disabled={currentPage === totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>

      <WarehouseFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editing}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
