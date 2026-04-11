import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { useTransactions } from "@/hooks/useSupabaseData";
import { IndianRupee, Banknote, Clock, TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { cn } from "@/lib/utils";

const revenueData = Array.from({ length: 90 }, (_, i) => {
  const revenue = 8000 + Math.floor(Math.random() * 5000);
  const cost = 4000 + Math.floor(Math.random() * 3000);
  return { day: `Day ${i + 1}`, revenue, cost, margin: revenue - cost };
});

export default function AdminFinance() {
  const { data: transactions = [], isLoading } = useTransactions();

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Finance & Wallet" breadcrumb={["Admin", "Finance"]} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard icon={IndianRupee} label="Total Revenue" value="₹2,48,920" color="primary" />
        <KPICard icon={Banknote} label="COD Collected" value="₹1,82,400" color="success" />
        <KPICard icon={Clock} label="Pending Payout" value="₹34,210" color="warning" />
        <KPICard icon={TrendingUp} label="Platform Margin" value="₹28,490" color="tertiary" />
      </div>

      <div className="rounded-lg bg-card shadow-card p-5 mb-6">
        <h3 className="font-semibold text-text-primary mb-1">Revenue vs Cost</h3>
        <p className="text-xs text-text-muted mb-4">Last 90 days · Shaded area = profit margin</p>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={revenueData}>
            <defs>
              <linearGradient id="marginFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
            <XAxis dataKey="day" tick={{ fontSize: 9 }} stroke="hsl(var(--color-text-muted))" interval={14} />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--color-card))', border: '1px solid hsl(var(--color-border))', borderRadius: 8, fontSize: 12 }}
              formatter={(value: number, name: string) => [`₹${value.toLocaleString()}`, name.charAt(0).toUpperCase() + name.slice(1)]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="revenue" stroke="hsl(var(--color-primary))" fill="none" strokeWidth={2.5} />
            <Area type="monotone" dataKey="cost" stroke="hsl(var(--color-danger))" fill="none" strokeWidth={2} strokeDasharray="6 3" />
            <Area type="monotone" dataKey="margin" stroke="none" fill="url(#marginFill)" fillOpacity={1} name="Margin" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg bg-card shadow-card overflow-x-auto">
        <div className="p-4 border-b border-border"><h3 className="font-semibold text-text-primary">Transactions</h3></div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-surface-2/50">
            <th className="p-3 text-left font-medium text-text-secondary">Date</th>
            <th className="p-3 text-left font-medium text-text-secondary">Description</th>
            <th className="p-3 text-left font-medium text-text-secondary">Txn ID</th>
            <th className="p-3 text-left font-medium text-text-secondary">Type</th>
            <th className="p-3 text-right font-medium text-text-secondary">Amount</th>
            <th className="p-3 text-right font-medium text-text-secondary">Balance</th>
          </tr></thead>
          <tbody>
            {transactions.slice(0, 15).map(t => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="p-3 text-text-muted">{t.date}</td>
                <td className="p-3 text-text-primary">{t.description}</td>
                <td className="p-3 font-mono text-xs text-text-muted">{t.txnId}</td>
                <td className="p-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", t.type === "Credit" ? "bg-success-light text-success-dark" : "bg-danger-light text-danger-dark")}>{t.type}</span></td>
                <td className={cn("p-3 text-right font-medium", t.amount > 0 ? "text-success" : "text-danger")}>
                  {t.amount > 0 ? "+" : ""}₹{Math.abs(t.amount).toLocaleString()}
                </td>
                <td className="p-3 text-right text-text-primary">₹{t.balance.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
