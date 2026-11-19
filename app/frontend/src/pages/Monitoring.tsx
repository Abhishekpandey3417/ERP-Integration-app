/** Module 7 — Monitoring: 12 Live System Metrics, Real-time Alerting, and 24h Telemetry. */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Cpu,
  Filter,
  HelpCircle,
  LineChart as LineChartIcon,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { toast } from "sonner";

import { apiGet, apiPut } from "@/lib/api";
import type { MonitoringMetric, AlertItem } from "@/lib/types";
import { PageHeader, Loading, ErrorState, KpiCard } from "@/components/shared";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useAuth } from "@/components/shell";

interface TimeseriesData {
  latency: { hour: string; avg_latency_ms: number; errors: number }[];
  throughput: { hour: string; records: number }[];
}

export default function Monitoring() {
  const qc = useQueryClient();
  const user = useAuth();
  const isAdmin = user.role === "admin";

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Edit threshold modal state
  const [editingMetric, setEditingMetric] = useState<MonitoringMetric | null>(null);
  const [warnInput, setWarnInput] = useState<string>("");
  const [critInput, setCritInput] = useState<string>("");

  // Fetch metrics
  const metricsQ = useQuery({
    queryKey: ["monitoring-metrics"],
    queryFn: () => apiGet<MonitoringMetric[]>("/monitoring/metrics"),
    refetchInterval: 10_000,
  });

  // Fetch alerts
  const alertsQ = useQuery({
    queryKey: ["monitoring-alerts"],
    queryFn: () => apiGet<AlertItem[]>("/monitoring/alerts"),
    refetchInterval: 10_000,
  });

  // Fetch timeseries
  const timeseriesQ = useQuery({
    queryKey: ["monitoring-timeseries"],
    queryFn: () => apiGet<TimeseriesData>("/monitoring/timeseries"),
    refetchInterval: 30_000,
  });

  // Threshold update mutation
  const updateThresholdMutation = useMutation({
    mutationFn: async ({ key, warn, crit }: { key: string; warn: number; crit: number }) => {
      return apiPut<MonitoringMetric>(`/monitoring/metrics/${key}`, {
        warn_threshold: warn,
        crit_threshold: crit,
      });
    },
    onSuccess: (updated) => {
      toast.success(`Thresholds for "${updated.name}" updated successfully.`);
      qc.invalidateQueries({ queryKey: ["monitoring-metrics"] });
      qc.invalidateQueries({ queryKey: ["monitoring-alerts"] });
      setEditingMetric(null);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to update metric thresholds");
    },
  });

  const handleOpenEdit = (m: MonitoringMetric) => {
    setEditingMetric(m);
    setWarnInput(m.warn_threshold.toString());
    setCritInput(m.crit_threshold.toString());
  };

  const handleSaveThreshold = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMetric) return;
    const warn = parseFloat(warnInput);
    const crit = parseFloat(critInput);
    if (isNaN(warn) || isNaN(crit) || warn < 0 || crit < 0) {
      toast.error("Please enter valid non-negative numbers for thresholds");
      return;
    }
    updateThresholdMutation.mutate({ key: editingMetric.key, warn, crit });
  };

  const metrics = metricsQ.data || [];
  const alerts = alertsQ.data || [];
  const timeseries = timeseriesQ.data || { latency: [], throughput: [] };

  // KPI Calculations
  const totalMetrics = metrics.length;
  const okCount = metrics.filter((m) => m.state === "ok").length;
  const warnCount = metrics.filter((m) => m.state === "warn").length;
  const critCount = metrics.filter((m) => m.state === "crit").length;

  const categories = ["all", "Performance", "Reliability", "Platform", "Pipeline", "Errors", "Compliance"];

  // Filtered metrics
  const filteredMetrics = metrics.filter((m) => {
    if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
    if (statusFilter !== "all" && m.state !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        m.key.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const isRefreshing = metricsQ.isFetching || alertsQ.isFetching || timeseriesQ.isFetching;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="System Observability & Monitoring"
        description="12 continuous integration metrics, automated threshold breach alerting, and 24-hour API latency and ETL throughput telemetry."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            metricsQ.refetch();
            alertsQ.refetch();
            timeseriesQ.refetch();
            toast.info("Telemetry refreshed");
          }}
          disabled={isRefreshing}
          className="border-slate-300"
        >
          <RefreshCw className={`mr-2 size-3.5 ${isRefreshing ? "animate-spin text-[#373757]" : ""}`} />
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </PageHeader>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Overall System Health"
          value={
            critCount > 0 ? (
              <span className="text-rose-600 flex items-center gap-1.5">
                <XCircle className="size-5" /> Critical Action
              </span>
            ) : warnCount > 0 ? (
              <span className="text-amber-600 flex items-center gap-1.5">
                <AlertTriangle className="size-5" /> Warnings Present
              </span>
            ) : (
              <span className="text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="size-5" /> All Healthy
              </span>
            )
          }
          sub={
            critCount > 0
              ? `${critCount} critical threshold breached`
              : warnCount > 0
              ? `${warnCount} warning thresholds exceeded`
              : "All 12 metrics within SLA tolerances"
          }
          tone={critCount > 0 ? "danger" : warnCount > 0 ? "warning" : "success"}
        />

        <KpiCard
          label="Active SLA Alerts"
          value={alerts.length}
          sub={`${critCount} Critical · ${warnCount} Warning`}
          tone={alerts.length > 0 ? (critCount > 0 ? "danger" : "warning") : "success"}
        />

        <KpiCard
          label="Healthy Indicators"
          value={`${okCount} / ${totalMetrics}`}
          sub={totalMetrics > 0 ? `${Math.round((okCount / totalMetrics) * 100)}% compliance` : "Loading..."}
          tone="info"
        />

        <KpiCard
          label="Telemetry Cadence"
          value="10s Live"
          sub="Auto-refreshing WebSocket / Polling"
          tone="default"
        />
      </div>

      {/* Active Alerts Panel */}
      {alerts.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/40 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <Bell className="size-4 animate-bounce" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-amber-950">
                    Active System Threshold Alerts ({alerts.length})
                  </CardTitle>
                  <CardDescription className="text-xs text-amber-800">
                    One or more pipeline performance or compliance metrics currently violate configured SLA limits.
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800 font-mono text-xs">
                Requires Attention
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 rounded-md border p-3 text-xs ${
                    alert.severity === "crit"
                      ? "border-rose-200 bg-rose-50/80 text-rose-900"
                      : "border-amber-200 bg-amber-50/80 text-amber-900"
                  }`}
                >
                  {alert.severity === "crit" ? (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-rose-600" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  )}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">{alert.metric_name}</span>
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          alert.severity === "crit"
                            ? "bg-rose-600 text-white"
                            : "bg-amber-600 text-white"
                        }`}
                      >
                        {alert.severity}
                      </span>
                    </div>
                    <p className="text-slate-700">{alert.message}</p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <span>
                        Current Value:{" "}
                        <strong className="text-slate-900 font-mono">
                          {alert.value} {alert.unit}
                        </strong>
                      </span>
                      <span>·</span>
                      <span>
                        Breach Threshold:{" "}
                        <strong className="text-slate-900 font-mono">
                          {alert.threshold} {alert.unit}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-200 bg-emerald-50/30 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-950">Zero Active SLA Alerts</p>
              <p className="text-xs text-emerald-700">
                All 12 monitored metrics across S/4HANA connectivity, transformation, and database persistence are operating within designated parameters.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 24-Hour Telemetry Graphs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Latency & Error Telemetry */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Activity className="size-4 text-[#373757]" /> 24h API Latency & Error Trend
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Hourly average latency (ms) and error count from synthetic and live endpoint probes.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {timeseriesQ.isLoading ? (
              <Loading label="Loading latency telemetry…" />
            ) : timeseries.latency.length === 0 ? (
              <div className="flex h-56 items-center justify-center text-xs text-slate-400">
                No latency records available in the last 24 hours.
              </div>
            ) : (
              <div className="h-56 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeseries.latency} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#373757" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#373757" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="errorGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#E11D48" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#E11D48" stopOpacity={0.2} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis
                      dataKey="hour"
                      tickLine={false}
                      stroke="#94A3B8"
                      fontSize={11}
                      interval={Math.max(1, Math.floor(timeseries.latency.length / 6))}
                    />
                    <YAxis
                      stroke="#94A3B8"
                      fontSize={11}
                      tickLine={false}
                      unit="ms"
                      domain={["auto", "auto"]}
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
                        name === "avg_latency_ms" ? `${val} ms` : `${val} errors`,
                        name === "avg_latency_ms" ? "Avg Latency" : "Errors",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="avg_latency_ms"
                      stroke="#373757"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#latencyGradient)"
                      name="avg_latency_ms"
                    />
                    <Area
                      type="monotone"
                      dataKey="errors"
                      stroke="#E11D48"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#errorGradient)"
                      name="errors"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Throughput Telemetry */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="size-4 text-emerald-600" /> 24h Ingestion Throughput
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Records loaded and verified in FinSight INR Analytics Store per hour.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {timeseriesQ.isLoading ? (
              <Loading label="Loading throughput telemetry…" />
            ) : timeseries.throughput.length === 0 ? (
              <div className="flex h-56 items-center justify-center text-xs text-slate-400">
                No ingestion runs recorded in the last 24 hours.
              </div>
            ) : (
              <div className="h-56 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeseries.throughput} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis
                      dataKey="hour"
                      tickLine={false}
                      stroke="#94A3B8"
                      fontSize={11}
                      interval={Math.max(1, Math.floor(timeseries.throughput.length / 6))}
                    />
                    <YAxis
                      stroke="#94A3B8"
                      fontSize={11}
                      tickLine={false}
                      unit=" rec"
                      domain={[0, "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1E1E38",
                        borderRadius: "6px",
                        border: "none",
                        fontSize: "12px",
                        color: "#fff",
                      }}
                      formatter={(val: any) => [`${val} records`, "Loaded"]}
                    />
                    <Bar dataKey="records" fill="#059669" radius={[4, 4, 0, 0]} name="Records" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-2 text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Filter className="size-3" /> Category:
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === cat
                  ? "bg-[#373757] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {cat === "all" ? "All Categories" : cat}
            </button>
          ))}
        </div>

        {/* Status Filter & Search */}
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-700 shadow-sm focus:border-slate-500 focus:outline-none"
          >
            <option value="all">All States</option>
            <option value="ok">Normal (OK)</option>
            <option value="warn">Warning (WARN)</option>
            <option value="crit">Critical (CRIT)</option>
          </select>

          <div className="relative w-48 sm:w-60">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search metrics…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* 12 Metrics Grid */}
      {metricsQ.isLoading ? (
        <Loading label="Computing 12 live system telemetry metrics…" />
      ) : metricsQ.isError ? (
        <ErrorState error={metricsQ.error} onRetry={() => metricsQ.refetch()} />
      ) : filteredMetrics.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          No metrics matched the selected filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredMetrics.map((m) => {
            const isWarn = m.state === "warn";
            const isCrit = m.state === "crit";
            const isOk = m.state === "ok";

            return (
              <Card
                key={m.key}
                className={`flex flex-col justify-between border transition-all ${
                  isCrit
                    ? "border-rose-300 bg-rose-50/20 shadow-sm"
                    : isWarn
                    ? "border-amber-300 bg-amber-50/20 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                          {m.category}
                        </Badge>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {m.direction === "above" ? "Alert on High (≥)" : "Alert on Low (≤)"}
                        </span>
                      </div>
                      <CardTitle className="text-sm font-semibold text-slate-900 leading-tight">
                        {m.name}
                      </CardTitle>
                    </div>

                    {/* State Badge with indicator dot */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          isCrit
                            ? "bg-rose-100 text-rose-800 border border-rose-300"
                            : isWarn
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            isCrit
                              ? "bg-rose-600 animate-ping"
                              : isWarn
                              ? "bg-amber-600"
                              : "bg-emerald-600"
                          }`}
                        />
                        {m.state}
                      </span>
                    </div>
                  </div>
                  <CardDescription className="text-xs text-slate-500 pt-1 line-clamp-2" title={m.description}>
                    {m.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  {/* Big Live Value Display */}
                  <div className="flex items-baseline justify-between rounded-md bg-slate-50 p-3 border border-slate-100">
                    <span className="text-xs font-medium text-slate-500">Live Reading</span>
                    <div className="flex items-baseline gap-1">
                      <span
                        className={`font-mono text-2xl font-bold tracking-tight ${
                          isCrit ? "text-rose-600" : isWarn ? "text-amber-600" : "text-slate-900"
                        }`}
                      >
                        {m.value !== null ? formatNumber(m.value) : "—"}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">{m.unit}</span>
                    </div>
                  </div>

                  {/* Threshold Indicators */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded border border-amber-100 bg-amber-50/50 p-2">
                      <div className="text-[10px] font-medium text-amber-800">
                        Warn {m.direction === "above" ? "≥" : "≤"}
                      </div>
                      <div className="font-mono text-xs font-semibold text-amber-900">
                        {m.warn_threshold} {m.unit}
                      </div>
                    </div>
                    <div className="rounded border border-rose-100 bg-rose-50/50 p-2">
                      <div className="text-[10px] font-medium text-rose-800">
                        Crit {m.direction === "above" ? "≥" : "≤"}
                      </div>
                      <div className="font-mono text-xs font-semibold text-rose-900">
                        {m.crit_threshold} {m.unit}
                      </div>
                    </div>
                  </div>

                  {/* Footer / Threshold Action */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-400">
                    <span>
                      Key: <code className="font-mono text-[10px] text-slate-600">{m.key}</code>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEdit(m)}
                      className="h-7 px-2 text-xs text-[#373757] hover:bg-slate-100"
                    >
                      <Settings2 className="mr-1 size-3" />
                      Configure
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Threshold Modal Dialog */}
      <Dialog open={!!editingMetric} onOpenChange={(open: boolean) => !open && setEditingMetric(null)}>
        <DialogContent className="sm:max-w-md">
          {editingMetric && (
            <form onSubmit={handleSaveThreshold} className="space-y-4">
              <DialogHeader>
                <div className="flex items-center gap-2 text-[#373757]">
                  <Settings2 className="size-5" />
                  <DialogTitle className="text-base font-semibold">
                    Configure Metric Thresholds
                  </DialogTitle>
                </div>
                <DialogDescription className="text-xs text-slate-500">
                  Update alert trigger thresholds for <strong className="text-slate-800">{editingMetric.name}</strong>.
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600 border border-slate-200 space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Category:</span>
                  <span>{editingMetric.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Trigger Logic:</span>
                  <span>
                    Breached when value is{" "}
                    <strong>{editingMetric.direction === "above" ? "higher than" : "lower than"}</strong> threshold
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Current Value:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {editingMetric.value !== null ? editingMetric.value : "—"} {editingMetric.unit}
                  </span>
                </div>
              </div>

              {!isAdmin && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <strong>Read-only role:</strong> You are currently signed in as a Financial Auditor. Threshold reconfiguration requires an Administrator account (admin@meridian.com).
                </div>
              )}

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span>Warning Threshold ({editingMetric.unit})</span>
                    <span className="text-[11px] text-amber-700 font-normal">
                      Triggers WARN state when {editingMetric.direction === "above" ? "≥" : "≤"} value
                    </span>
                  </label>
                  <Input
                    type="number"
                    step="any"
                    value={warnInput}
                    onChange={(e) => setWarnInput(e.target.value)}
                    disabled={!isAdmin || updateThresholdMutation.isPending}
                    required
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span>Critical Threshold ({editingMetric.unit})</span>
                    <span className="text-[11px] text-rose-700 font-normal">
                      Triggers CRIT state when {editingMetric.direction === "above" ? "≥" : "≤"} value
                    </span>
                  </label>
                  <Input
                    type="number"
                    step="any"
                    value={critInput}
                    onChange={(e) => setCritInput(e.target.value)}
                    disabled={!isAdmin || updateThresholdMutation.isPending}
                    required
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingMetric(null)}
                  disabled={updateThresholdMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!isAdmin || updateThresholdMutation.isPending}
                  className="bg-[#373757] hover:bg-[#2c2c46] text-white"
                >
                  {updateThresholdMutation.isPending ? "Saving…" : "Save Thresholds"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
