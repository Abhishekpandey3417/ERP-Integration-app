/** Module 8 — Financial Analytics: Consolidated INR Financials, Monthly Flows, AP/AR Aging, and Multi-Plant Performance. */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Receipt,
  Building2,
  Calendar,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  RefreshCw,
  Layers,
  FileSpreadsheet,
  PieChart as PieChartIcon,
  BarChart3,
  CheckCircle2,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import { toast } from "sonner";

import { apiGet } from "@/lib/api";
import type { FinancialAnalytics as FinancialAnalyticsData, PlantPerformance } from "@/lib/types";
import { PageHeader, Loading, ErrorState, KpiCard } from "@/components/shared";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  formatInr,
  formatInrCompact,
  formatNumber,
  formatPct,
  formatDateTime,
  formatMonthLabel,
} from "@/lib/format";

const PLANT_METADATA: Record<string, { name: string; segment: string; state: string; gstin: string }> = {
  "PL-101": { name: "Chakan Plant", segment: "Automotive Components", state: "Maharashtra", gstin: "27AAACM1234F1Z5" },
  "PL-102": { name: "Sriperumbudur Plant", segment: "Heavy Machinery", state: "Tamil Nadu", gstin: "33AAACM1234F1Z8" },
  "PL-103": { name: "Sanand Plant", segment: "Precision Engineering", state: "Gujarat", gstin: "24AAACM1234F1Z2" },
  "PL-104": { name: "Baddi Plant", segment: "Industrial Coatings", state: "Himachal Pradesh", gstin: "02AAACM1234F1Z1" },
  "PL-105": { name: "Jamshedpur Plant", segment: "Forging & Foundry", state: "Jharkhand", gstin: "20AAACM1234F1Z4" },
  "PL-106": { name: "Hosur Plant", segment: "Electrical Assemblies", state: "Tamil Nadu", gstin: "33AAACM1234F1Z9" },
  "PL-107": { name: "Noida Plant", segment: "Tooling & R&D", state: "Uttar Pradesh", gstin: "09AAACM1234F1Z7" },
};

const AGING_COLORS: Record<string, string> = {
  "0-30": "#10B981", // green (current)
  "31-60": "#3B82F6", // blue
  "61-90": "#F59E0B", // amber
  "90+": "#EF4444", // red (overdue/risk)
};

export default function FinancialAnalytics() {
  const [activeTab, setActiveTab] = useState<string>("overview");

  // Query financial analytics (KPIs, monthly series, AP/AR aging)
  const financialQ = useQuery({
    queryKey: ["financial-analytics"],
    queryFn: () => apiGet<FinancialAnalyticsData>("/analytics/financial"),
    refetchInterval: 30_000,
  });

  // Query plants performance
  const plantsQ = useQuery({
    queryKey: ["plants-analytics"],
    queryFn: () => apiGet<{ plants: PlantPerformance[] }>("/analytics/plants"),
    refetchInterval: 30_000,
  });

  const isRefreshing = financialQ.isFetching || plantsQ.isFetching;

  const handleRefresh = () => {
    financialQ.refetch();
    plantsQ.refetch();
    toast.info("Financial analytics updated with latest FinSight data");
  };

  if (financialQ.isLoading || plantsQ.isLoading) {
    return <Loading label="Calculating consolidated INR financials and plant metrics…" />;
  }

  if (financialQ.isError) {
    return <ErrorState error={financialQ.error} onRetry={handleRefresh} />;
  }

  const fin = financialQ.data;
  const kpis = fin?.kpis;
  const monthly = fin?.monthly || [];
  const aging = fin?.aging || { payables: [], receivables: [] };
  const plants = plantsQ.data?.plants || [];

  // Compute EBITDA margin
  const revenue = kpis?.revenue_inr || 0;
  const expenses = kpis?.expenses_inr || 0;
  const ebitda = kpis?.ebitda_inr || 0;
  const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0;

  // Total AP and AR aging sums
  const totalApAging = aging.payables.reduce((acc, curr) => acc + curr.amount_inr, 0);
  const totalArAging = aging.receivables.reduce((acc, curr) => acc + curr.amount_inr, 0);
  const totalApCount = aging.payables.reduce((acc, curr) => acc + curr.count, 0);
  const totalArCount = aging.receivables.reduce((acc, curr) => acc + curr.count, 0);

  // Combine aging buckets for comparison chart
  const agingComparisonData = ["0-30", "31-60", "61-90", "90+"].map((b) => {
    const apItem = aging.payables.find((x) => x.bucket === b);
    const arItem = aging.receivables.find((x) => x.bucket === b);
    return {
      bucket: `${b} Days`,
      rawBucket: b,
      apAmount: apItem ? apItem.amount_inr : 0,
      arAmount: arItem ? arItem.amount_inr : 0,
      apCount: apItem ? apItem.count : 0,
      arCount: arItem ? arItem.count : 0,
    };
  });

  // Chart data for monthly trend with formatted month labels
  const monthlyChartData = monthly.map((m) => ({
    ...m,
    monthLabel: formatMonthLabel(m.month),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Financial Analytics & Consolidated Reporting"
        description="Single-pane INR consolidated financials, Indian FY operating cash runs, AP/AR working capital aging, and multi-plant profitability."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="border-slate-300"
        >
          <RefreshCw className={`mr-2 size-3.5 ${isRefreshing ? "animate-spin text-[#373757]" : ""}`} />
          {isRefreshing ? "Refreshing…" : "Refresh Financials"}
        </Button>
      </PageHeader>

      {/* Primary Financial KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Consolidated Revenue"
          value={formatInrCompact(kpis?.revenue_inr)}
          sub="FinSight Sales Orders (INR)"
          tone="default"
        />

        <KpiCard
          label="Operating Expenses"
          value={formatInrCompact(kpis?.expenses_inr)}
          sub="AP Invoices & GL Debits"
          tone="warning"
        />

        <KpiCard
          label="Operating EBITDA"
          value={formatInrCompact(kpis?.ebitda_inr)}
          sub={`${ebitdaMargin.toFixed(1)}% EBITDA margin`}
          tone={ebitda >= 0 ? "success" : "danger"}
        />

        <KpiCard
          label="Net Operating Cash"
          value={formatInrCompact(kpis?.net_cash_flow_inr)}
          sub={`In ${formatInrCompact(kpis?.cash_inflow_inr)} · Out ${formatInrCompact(kpis?.cash_outflow_inr)}`}
          tone={(kpis?.net_cash_flow_inr || 0) >= 0 ? "success" : "warning"}
        />

        <KpiCard
          label="AR Outstanding"
          value={formatInrCompact(kpis?.ar_outstanding_inr)}
          sub="Customer receivables"
          tone="info"
        />

        <KpiCard
          label="AP Outstanding"
          value={formatInrCompact(kpis?.ap_outstanding_inr)}
          sub="Vendor liabilities"
          tone="default"
        />
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 border border-slate-200">
          <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-xs">
            <BarChart3 className="mr-1.5 size-3.5" /> Monthly Financial Flows
          </TabsTrigger>
          <TabsTrigger value="aging" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-xs">
            <Clock className="mr-1.5 size-3.5" /> AP & AR Working Capital Aging
          </TabsTrigger>
          <TabsTrigger value="plants" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-xs">
            <Building2 className="mr-1.5 size-3.5" /> Multi-Plant Performance ({plants.length})
          </TabsTrigger>
          <TabsTrigger value="statutory" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-xs">
            <Receipt className="mr-1.5 size-3.5" /> GST & Statutory Consolidation
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW & MONTHLY FLOWS */}
        <TabsContent value="overview" className="space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="size-4 text-[#373757]" /> 12-Month Consolidated INR Trajectory
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Monthly Sales Order Revenue, Operating Expenses, and Net Cash Flow reconciled in FinSight.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-[#373757]" /> Revenue (INR)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-amber-500" /> Expenses (INR)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-emerald-500" /> Net Cash
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {monthlyChartData.length === 0 ? (
                <div className="flex h-72 items-center justify-center text-xs text-slate-400">
                  No monthly accounting periods recorded. Run synchronization to populate documents.
                </div>
              ) : (
                <div className="h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={monthlyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="monthLabel" stroke="#94A3B8" fontSize={11} tickLine={false} />
                      <YAxis
                        stroke="#94A3B8"
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(v) => formatInrCompact(v)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1E1E38",
                          borderRadius: "6px",
                          border: "none",
                          fontSize: "12px",
                          color: "#fff",
                        }}
                        formatter={(val: any, name: any) => [
                          formatInr(Number(val) || 0),
                          name === "revenue_inr"
                            ? "Revenue"
                            : name === "expenses_inr"
                            ? "Expenses"
                            : "Net Cash Flow",
                        ]}
                      />
                      <Bar dataKey="revenue_inr" fill="#373757" radius={[4, 4, 0, 0]} name="revenue_inr" />
                      <Bar dataKey="expenses_inr" fill="#F59E0B" radius={[4, 4, 0, 0]} name="expenses_inr" />
                      <Line
                        type="monotone"
                        dataKey="net_cash_flow_inr"
                        stroke="#10B981"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: "#10B981" }}
                        name="net_cash_flow_inr"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Metrics Breakdown Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Wallet className="size-4 text-emerald-600" /> Cash Conversion Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">Gross Cash Inflows</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatInr(kpis?.cash_inflow_inr)}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">Gross Cash Outflows</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatInr(kpis?.cash_outflow_inr)}
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="font-medium text-slate-700">Net Operating Flow</span>
                  <span
                    className={`font-mono font-bold ${
                      (kpis?.net_cash_flow_inr || 0) >= 0 ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {formatInr(kpis?.net_cash_flow_inr)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Layers className="size-4 text-blue-600" /> Working Capital & Inventory
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">Inventory Valuation</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatInr(kpis?.inventory_value_inr)}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">Net Working Capital Gap (AR - AP)</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatInr((kpis?.ar_outstanding_inr || 0) - (kpis?.ap_outstanding_inr || 0))}
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="font-medium text-slate-700">EBITDA Conversion</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatPct(ebitdaMargin)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Receipt className="size-4 text-purple-600" /> Statutory & Compliance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">GST Collected on Sales</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatInr(kpis?.gst_collected_inr)}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">Functional Currency</span>
                  <span className="font-mono font-semibold text-slate-900">INR (₹)</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="font-medium text-slate-700">Consolidation Engine</span>
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> S/4HANA Validated
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: AP & AR AGING */}
        <TabsContent value="aging" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Accounts Receivable Aging */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <ArrowDownRight className="size-4 text-emerald-600" /> Accounts Receivable Aging (AR)
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Unsettled invoices from customer sales orders across Indian manufacturing accounts.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs border-emerald-300 bg-emerald-50 text-emerald-800">
                    {formatInrCompact(totalArAging)} Total
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={aging.receivables} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="bucket" stroke="#94A3B8" fontSize={11} tickLine={false} />
                      <YAxis
                        stroke="#94A3B8"
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(v) => formatInrCompact(v)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1E1E38",
                          borderRadius: "6px",
                          border: "none",
                          fontSize: "12px",
                          color: "#fff",
                        }}
                        formatter={(val: any) => [formatInr(Number(val) || 0), "Receivables"]}
                      />
                      <Bar dataKey="amount_inr" radius={[4, 4, 0, 0]}>
                        {aging.receivables.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={AGING_COLORS[entry.bucket] || "#373757"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Aging Period</TableHead>
                      <TableHead className="text-right text-xs">Open Invoices</TableHead>
                      <TableHead className="text-right text-xs">Amount (INR)</TableHead>
                      <TableHead className="text-right text-xs">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aging.receivables.map((r) => {
                      const share = totalArAging > 0 ? (r.amount_inr / totalArAging) * 100 : 0;
                      return (
                        <TableRow key={r.bucket}>
                          <TableCell className="text-xs font-medium flex items-center gap-2">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: AGING_COLORS[r.bucket] || "#94A3B8" }}
                            />
                            {r.bucket} Days
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.count}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold text-slate-900">
                            {formatInr(r.amount_inr)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-slate-500">
                            {share.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Accounts Payable Aging */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <ArrowUpRight className="size-4 text-amber-600" /> Accounts Payable Aging (AP)
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Open vendor payment obligations, supplier invoices, and procurement obligations.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs border-amber-300 bg-amber-50 text-amber-800">
                    {formatInrCompact(totalApAging)} Total
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={aging.payables} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="bucket" stroke="#94A3B8" fontSize={11} tickLine={false} />
                      <YAxis
                        stroke="#94A3B8"
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(v) => formatInrCompact(v)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1E1E38",
                          borderRadius: "6px",
                          border: "none",
                          fontSize: "12px",
                          color: "#fff",
                        }}
                        formatter={(val: any) => [formatInr(Number(val) || 0), "Payables"]}
                      />
                      <Bar dataKey="amount_inr" radius={[4, 4, 0, 0]}>
                        {aging.payables.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={AGING_COLORS[entry.bucket] || "#373757"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Aging Period</TableHead>
                      <TableHead className="text-right text-xs">Open Invoices</TableHead>
                      <TableHead className="text-right text-xs">Amount (INR)</TableHead>
                      <TableHead className="text-right text-xs">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aging.payables.map((p) => {
                      const share = totalApAging > 0 ? (p.amount_inr / totalApAging) * 100 : 0;
                      return (
                        <TableRow key={p.bucket}>
                          <TableCell className="text-xs font-medium flex items-center gap-2">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: AGING_COLORS[p.bucket] || "#94A3B8" }}
                            />
                            {p.bucket} Days
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{p.count}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold text-slate-900">
                            {formatInr(p.amount_inr)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-slate-500">
                            {share.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: MULTI-PLANT PERFORMANCE */}
        <TabsContent value="plants" className="space-y-6">
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <Building2 className="size-4 text-[#373757]" /> Manufacturing Plant Performance Comparison
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Revenue, operating expenses, GST paid, and S/4HANA ETL sync reliability across Meridian's production units.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Plant Revenue vs Expense Bar Chart */}
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={plants} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="plant_code" stroke="#94A3B8" fontSize={11} tickLine={false} />
                    <YAxis
                      stroke="#94A3B8"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(v) => formatInrCompact(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1E1E38",
                        borderRadius: "6px",
                        border: "none",
                        fontSize: "12px",
                        color: "#fff",
                      }}
                      formatter={(val: any, name: any) => [
                        formatInr(Number(val) || 0),
                        name === "revenue_inr" ? "Revenue" : "Expenses",
                      ]}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      formatter={(value) => (value === "revenue_inr" ? "Revenue (INR)" : "Expenses (INR)")}
                    />
                    <Bar dataKey="revenue_inr" fill="#373757" radius={[4, 4, 0, 0]} name="revenue_inr" />
                    <Bar dataKey="expenses_inr" fill="#F59E0B" radius={[4, 4, 0, 0]} name="expenses_inr" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Plant Detail Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Plant</TableHead>
                    <TableHead className="text-xs">Facility & State</TableHead>
                    <TableHead className="text-xs">Industry Segment</TableHead>
                    <TableHead className="text-right text-xs">Revenue (INR)</TableHead>
                    <TableHead className="text-right text-xs">Expenses (INR)</TableHead>
                    <TableHead className="text-right text-xs">Operating Margin</TableHead>
                    <TableHead className="text-right text-xs">GST Paid (INR)</TableHead>
                    <TableHead className="text-right text-xs">Sync SLA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plants.map((p) => {
                    const meta = PLANT_METADATA[p.plant_code] || {
                      name: p.plant_code,
                      segment: "Manufacturing",
                      state: "India",
                      gstin: "—",
                    };
                    const margin = p.revenue_inr - p.expenses_inr;
                    const marginPct = p.revenue_inr > 0 ? (margin / p.revenue_inr) * 100 : 0;

                    return (
                      <TableRow key={p.plant_code}>
                        <TableCell className="font-mono text-xs font-bold text-slate-900">
                          {p.plant_code}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium text-slate-800">{meta.name}</div>
                          <div className="text-[11px] text-slate-400">{meta.state}</div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{meta.segment}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold text-slate-900">
                          {formatInr(p.revenue_inr)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-slate-700">
                          {formatInr(p.expenses_inr)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          <span
                            className={`font-semibold ${
                              margin >= 0 ? "text-emerald-700" : "text-rose-600"
                            }`}
                          >
                            {formatInrCompact(margin)}
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            {marginPct.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-purple-700">
                          {formatInr(p.gst_paid_inr)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-mono ${
                              p.reliability_pct >= 90
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : "border-amber-300 bg-amber-50 text-amber-800"
                            }`}
                          >
                            {p.reliability_pct.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: STATUTORY & GST CONSOLIDATION */}
        <TabsContent value="statutory" className="space-y-6">
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-600" /> Indian Statutory & Fiscal Consolidation
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Summary of GST collections, inter-state IGST splits, intra-state CGST+SGST, and RBI reference currency rules.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Total GST Collected (Sales)
                  </div>
                  <div className="mt-1 font-mono text-xl font-bold text-slate-900">
                    {formatInr(kpis?.gst_collected_inr)}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Collected on Outward Sales Orders across all 7 plants.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Total GST Paid (Purchases)
                  </div>
                  <div className="mt-1 font-mono text-xl font-bold text-purple-700">
                    {formatInr(plants.reduce((acc, p) => acc + p.gst_paid_inr, 0))}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Input Tax Credit (ITC) accrued on Vendor AP Invoices.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Consolidation Standard
                  </div>
                  <div className="mt-1 text-base font-bold text-slate-900">
                    Ind AS 21 & Schedule III
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Consolidated in INR with RBI daily reference FX rates.
                  </p>
                </div>
              </div>

              {/* Plant GSTIN registry */}
              <div className="rounded-md border border-slate-200 overflow-hidden">
                <div className="bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700">
                  Registered Plant GSTIN Directory (Company 1000 — Meridian Manufacturing Ltd)
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Plant Code</TableHead>
                      <TableHead className="text-xs">Operating State</TableHead>
                      <TableHead className="text-xs">GSTIN Identification</TableHead>
                      <TableHead className="text-xs">Tax Treatment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(PLANT_METADATA).map(([code, meta]) => (
                      <TableRow key={code}>
                        <TableCell className="font-mono text-xs font-semibold text-slate-900">
                          {code}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">
                          {meta.name} ({meta.state})
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-800">
                          {meta.gstin}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          Intra-state: CGST (9%) + SGST (9%) | Inter-state: IGST (18%)
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

