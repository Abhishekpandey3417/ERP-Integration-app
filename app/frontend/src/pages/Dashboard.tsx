/** Module 1 — Executive command center: KPIs, pipeline health, charts fed by live MongoDB data. */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
    Area,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ComposedChart,
    Legend,
    Line,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "@/lib/recharts";

import { apiGet } from "@/lib/api";
import type { DashboardSummary } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dot, ErrorState, KpiCard, Loading, PageHeader, StatusBadge } from "@/components/shared";
import { formatInr, formatInrCompact, formatNumber, formatPct, formatTimeAgo } from "@/lib/format";

const STATUS_COLORS: Record<string, string> = { synced: "#10B981", pending: "#F59E0B", failed: "#EF4444" };

export default function Dashboard() {
    const q = useQuery({
        queryKey: ["dashboard"],
        queryFn: () => apiGet<DashboardSummary>("/dashboard/summary"),
        refetchInterval: 30_000,
    });

    return (
        <div className="space-y-6">
            <PageHeader
                title="Executive Command Center"
                description="Live integration health across the simulated SAP S/4HANA estate and the FinSight INR analytics store."
            >
                <Button variant="outline" size="sm" onClick={() => void q.refetch()} data-testid="dashboard-refresh-button">
                    Refresh
                </Button>
            </PageHeader>

            {!q.data ? (
                q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <Loading label="Loading dashboard…" />
            ) : (
                <DashboardBody d={q.data} />
            )}
        </div>
    );
}

function DashboardBody({ d }: { d: DashboardSummary }) {
    return (
        <div className="space-y-6">
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                <KpiCard label="Total Records" value={formatNumber(d.records.total)} sub={`${formatNumber(d.records.destination)} in FinSight`} testid="kpi-total-records" />
                <KpiCard label="Successful Syncs" value={formatNumber(d.sync.successful_jobs_30d)} sub={`${d.sync.jobs_30d} jobs in 30d`} tone="success" testid="kpi-successful-syncs" />
                <KpiCard label="Failed Records" value={formatNumber(d.records.failed)} sub="awaiting retry / DLQ" tone="danger" testid="kpi-failed-records" />
                <KpiCard label="Pending Records" value={formatNumber(d.records.pending)} sub="queued for extraction" tone="warning" testid="kpi-pending-records" />
                <KpiCard label="API Success Rate" value={formatPct(d.api.success_rate_pct)} sub={`avg ${Math.round(d.api.avg_latency_ms)} ms`} testid="kpi-api-success-rate" />
                <KpiCard label="Net Financial Flow" value={formatInrCompact(d.financial.ebitda_inr)} sub={`revenue ${formatInrCompact(d.financial.revenue_inr)}`} testid="kpi-net-flow" />
            </div>

            {/* pipeline banner */}
            <Card>
                <CardContent className="flex flex-col items-stretch gap-4 py-4 md:flex-row md:items-center">
                    <PipelineNode title="SAP S/4HANA (simulated)" line={`${d.pipeline.source_endpoints_up}/${d.pipeline.source_endpoints_total} source endpoints up`} tone={d.pipeline.source_endpoints_up === d.pipeline.source_endpoints_total ? "ok" : "warn"} />
                    <ArrowRight className="mx-auto size-4 shrink-0 text-slate-400 max-md:rotate-90" aria-hidden />
                    <PipelineNode title="Staging · Validation · FX" line={`${formatNumber(d.records.pending)} pending · GST + fiscal checks`} tone="ok" />
                    <ArrowRight className="mx-auto size-4 shrink-0 text-slate-400 max-md:rotate-90" aria-hidden />
                    <PipelineNode title="FinSight Analytics" line={`${formatNumber(d.records.destination)} INR records · ap-south-1`} tone="ok" />
                    <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
                        <Dot tone={d.pipeline.breakers_open > 0 ? "bad" : "ok"} />
                        {d.pipeline.breakers_open > 0
                            ? `${d.pipeline.breakers_open} circuit breaker${d.pipeline.breakers_open > 1 ? "s" : ""} OPEN`
                            : "All circuits closed"}
                    </div>
                </CardContent>
            </Card>

            {/* charts */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="font-heading text-base">API latency & error rate — 24h</CardTitle>
                        <CardDescription>Measured from live endpoint tests (source + destination)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {d.latency_trend.length === 0 ? (
                            <p className="py-10 text-center text-sm text-slate-500">No API tests yet — run one in API Management</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={260}>
                                <ComposedChart data={d.latency_trend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip />
                                    <Area type="monotone" dataKey="avg_latency_ms" name="Avg latency (ms)" stroke="#373757" fill="#373757" fillOpacity={0.12} />
                                    <Line type="monotone" dataKey="error_rate_pct" name="Error rate (%)" stroke="#EF4444" dot={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="font-heading text-base">Record status mix</CardTitle>
                        <CardDescription>Across all 12 SAP domains (source records)</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center gap-4 md:flex-row">
                        <ResponsiveContainer width="60%" height={220}>
                            <PieChart>
                                <Pie data={d.status_mix} dataKey="count" nameKey="status" innerRadius={55} outerRadius={85} strokeWidth={1}>
                                    {d.status_mix.map((s) => (
                                        <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? "#94A3B8"} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: any) => formatNumber(Number(value) || 0)} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="space-y-2">
                            {d.status_mix.map((s) => (
                                <div key={s.status} className="flex items-center gap-2 text-sm">
                                    <span className="size-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.status] ?? "#94A3B8" }} aria-hidden />
                                    <span className="capitalize text-slate-600">{s.status}</span>
                                    <span className="font-mono font-semibold text-slate-900">{formatNumber(s.count)}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="font-heading text-base">Records per domain</CardTitle>
                        <CardDescription>SAP source documents extracted by the simulator</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={d.domain_health.map((h) => ({ key: h.key, name: h.name.split(" ")[0], total: h.total }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip />
                                <Bar dataKey="total" name="Records" fill="#373757" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="font-heading text-base">Recent execution & audit stream</CardTitle>
                        <CardDescription>Immutable audit trail — last 10 entries</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm" data-testid="audit-stream-table">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                                        <th className="py-2 pr-3 font-semibold">When</th>
                                        <th className="py-2 pr-3 font-semibold">Action</th>
                                        <th className="py-2 pr-3 font-semibold">Actor</th>
                                        <th className="py-2 font-semibold">Severity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {d.audit_recent.map((e) => (
                                        <tr key={e.id} className="border-b border-slate-100 last:border-0">
                                            <td className="py-2 pr-3 text-xs text-slate-500">{formatTimeAgo(e.created_at)}</td>
                                            <td className="py-2 pr-3 font-mono text-xs text-slate-800">{e.action}</td>
                                            <td className="py-2 pr-3 text-xs text-slate-600">{e.actor_email}</td>
                                            <td className="py-2"><Dot tone={e.severity === "error" ? "bad" : e.severity === "warning" ? "warn" : "ok"} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* domain health matrix */}
            <Card>
                <CardHeader>
                    <CardTitle className="font-heading text-base">Sync domain health matrix</CardTitle>
                    <CardDescription>All 12 financial domains · source → destination coverage</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {d.domain_health.map((h) => (
                            <Link
                                key={h.key}
                                to={`/simulator?domain=${h.key}`}
                                className="rounded-lg border border-slate-200 p-3 transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50"
                                data-testid={`domain-health-${h.key}`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="truncate text-sm font-semibold text-slate-800">{h.name}</p>
                                    <StatusBadge status={h.failed > 0 ? "failed" : h.pending > 0 ? "pending" : "synced"} />
                                </div>
                                <p className="mt-1 font-mono text-xs text-slate-500">
                                    {formatNumber(h.total)} records · {formatNumber(h.synced)} synced · {formatNumber(h.pending)} pending
                                </p>
                                <p className="text-xs text-slate-400">last sync {formatTimeAgo(h.last_sync_at)}</p>
                            </Link>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* plants quick bar */}
            <Card>
                <CardHeader>
                    <CardTitle className="font-heading text-base">Plant operations — 7 plants</CardTitle>
                    <CardDescription>Consolidated INR revenue and pipeline reliability</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                        {d.plants.map((p) => (
                            <div key={p.plant_code} className="rounded-lg border border-slate-200 p-3" data-testid={`plant-chip-${p.plant_code}`}>
                                <p className="text-xs font-semibold text-slate-800">{p.plant_code}</p>
                                <p className="mt-1 font-mono text-sm font-bold text-[#1E1E38]">{formatInrCompact(p.revenue_inr)}</p>
                                <p className="text-xs text-slate-500">{p.reliability_pct.toFixed(0)}% sync reliability</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function PipelineNode({ title, line, tone }: { title: string; line: string; tone: "ok" | "warn" }) {
    return (
        <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Dot tone={tone} /> {title}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{line}</p>
        </div>
    );
}
