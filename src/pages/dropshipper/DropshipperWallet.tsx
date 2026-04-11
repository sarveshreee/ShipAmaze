import { PageHeader } from "@/components/PageHeader";
import { transactions } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { IndianRupee, Plus, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DropshipperWallet() {
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Wallet" breadcrumb={["Dropshipper", "Wallet"]} />

      <div className="rounded-xl p-6 mb-6 text-primary-foreground" style={{ background: "linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-secondary)))" }}>
        <p className="text-sm opacity-80">Available Balance</p>
        <p className="text-3xl font-bold mt-1">₹ 12,450.00</p>
        <p className="text-sm opacity-70 mt-1">COD Pending: ₹ 8,200</p>
        <div className="flex gap-3 mt-4">
          <Button className="bg-card/20 hover:bg-card/30 text-primary-foreground border-0"><Plus className="h-4 w-4 mr-2"/>Add Funds</Button>
          <Button variant="outline" className="border-card/30 text-primary-foreground hover:bg-card/10"><ArrowUpRight className="h-4 w-4 mr-2"/>Withdraw</Button>
        </div>
      </div>

      <div className="rounded-lg bg-card shadow-card overflow-x-auto">
        <div className="p-4 border-b border-border"><h3 className="font-semibold text-text-primary">Transactions</h3></div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-surface-2/50">
            <th className="p-3 text-left font-medium text-text-secondary">Date</th>
            <th className="p-3 text-left font-medium text-text-secondary">Description</th>
            <th className="p-3 text-left font-medium text-text-secondary">Type</th>
            <th className="p-3 text-right font-medium text-text-secondary">Amount</th>
            <th className="p-3 text-right font-medium text-text-secondary">Balance</th>
          </tr></thead>
          <tbody>
            {transactions.slice(0, 15).map(t => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="p-3 text-text-muted">{t.date}</td>
                <td className="p-3 text-text-primary">{t.description}</td>
                <td className="p-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", t.type === "Credit" ? "bg-success-light text-success-dark" : "bg-danger-light text-danger-dark")}>{t.type}</span></td>
                <td className={cn("p-3 text-right font-medium", t.amount > 0 ? "text-success" : "text-danger")}>{t.amount > 0 ? "+" : ""}₹{Math.abs(t.amount).toLocaleString()}</td>
                <td className="p-3 text-right text-text-primary">₹{t.balance.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
