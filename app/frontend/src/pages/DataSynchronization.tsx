/** Module 4 — Data Synchronization: ETL Runner, Job History, and Schedule Configuration. */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCcw,
  Play,
  RotateCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ArrowRight,
  ShieldAlert,
  Calendar,
  Check,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiPost, apiPut } from "@/lib/api";
import { DOMAINS } from "@/lib/domains";
import type { SyncJob, SyncSchedule } from "@/lib/types";
import { PageHeader, Loading, ErrorState, StatusBadge, JsonViewer } from "@/components/shared";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDateTime, formatNumber, formatTimeAgo } from "@/lib/format";
import { useAuth } from "@/components/shell";

const SCHEDULE_INTERVALS = [
  "Every 15 minutes",
  "Hourly",
  "Every 6 hours",
  "Daily at 00:00 IST",
  "Paused",
];

export default function DataSynchronization() {
  const qc = useQueryClient();
  const user = useAuth();
  const isAdmin = user.role === "admin";

  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [inspectJob, setInspectJob] = useState<SyncJob | null>(null);

  // Manual Run Form State
  const [runDomain, setRunDomain] = useState<string>("gl");
  const [batchSize, setBatchSize] = useState<number>(50);
  const [strategy, setStrategy] = useState<string>("checksum");
  const [reprocess, setReprocess] = useState<boolean>(true);

  // Query jobs
  const jobsQ = useQuery({
    queryKey: ["sync-jobs", selectedDomain],
    queryFn: () =>
      apiGet<SyncJob[]>(
        selectedDomain === "all" ? "/sync/jobs?limit=50" : `/sync/jobs?domain=${selectedDomain}&limit=50`
      ),
    refetchInterval: 15_000,
  });

  // Query schedules
  const schedulesQ = useQuery({
    queryKey: ["sync-schedules"],
    queryFn: () => apiGet<SyncSchedule[]>("/sync/schedules"),
  });

  // Run ETL Mutation
  const runMutation = useMutation({
    mutationFn: (body: {
      domain: string;
      batch_size: number;
      strategy: string;
      reprocess: boolean;
    }) => apiPost<SyncJob>("/sync/run", body),
    onSuccess: (job) => {
      toast.success(`ETL Sync completed for ${job.domain.toUpperCase()}: ${job.message}`);
      qc.invalidateQueries({ queryKey: ["sync-jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Sync run failed";
      toast.error(msg);
    },
  });

  // Update schedule mutation
  const updateScheduleMutation = useMutation({
    mutationFn: ({ domain, interval }: { domain: string; interval: string }) =>
      apiPut<SyncSchedule>(`/sync/schedules/${domain}`, { interval }),
    onSuccess: (updated) => {
      toast.success(`Schedule for ${updated.domain.toUpperCase()} updated to '${updated.interval}'`);
      qc.invalidateQueries({ queryKey: ["sync-schedules"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to update schedule";
      toast.error(msg);
    },
  });

  const jobs = jobsQ.data || [];
  const totalLoaded = jobs.reduce((sum, j) => sum + (j.loaded || 0), 0);
  const totalExtracted = jobs.reduce((sum, j) => sum + (j.extracted || 0), 0);
  const totalSkipped = jobs.reduce((sum, j) => sum + (j.duplicates_skipped || 0), 0);
  const totalValErrors = jobs.reduce((sum, j) => sum + (j.validation_failed || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Synchronization (ETL Pipeline)"
        description="Trigger on-demand ETL runs, monitor ODP batch extractions, and manage synchronization intervals across SAP S/4HANA domains."
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-xs">
          <RefreshCcw className="size-3.5 text-[#373757]" />
          12 ODP Extraction Streams
        </span>
      </PageHeader>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Records Extracted</span>
            <Layers className="size-4 text-slate-400" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900">{formatNumber(totalExtracted)}</p>
          <p className="mt-1 text-xs text-slate-500">From simulated SAP S/4HANA</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Records Loaded (FinSight)</span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-emerald-700">{formatNumber(totalLoaded)}</p>
          <p className="mt-1 text-xs text-slate-500">Consolidated INR destinations</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Idempotent Deduplication</span>
            <Check className="size-4 text-indigo-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-indigo-700">{formatNumber(totalSkipped)}</p>
          <p className="mt-1 text-xs text-slate-500">Duplicates prevented by checksum</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Validation Filtered / DLQ</span>
            <ShieldAlert className="size-4 text-amber-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-amber-600">{formatNumber(totalValErrors)}</p>
          <p className="mt-1 text-xs text-slate-500">Routed to Error Management</p>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="jobs">
        <TabsList className="bg-slate-200/70 p-1">
          <TabsTrigger value="jobs">ETL Execution History ({jobs.length})</TabsTrigger>
          <TabsTrigger value="manual">Run On-Demand Sync</TabsTrigger>
          <TabsTrigger value="schedules">Automated Schedules</TabsTrigger>
        </TabsList>

        {/* Tab 1: Execution History */}
        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    ETL Pipeline Job History
                  </CardTitle>
                  <CardDescription>
                    Real-time audit log of extraction, transformation, deduplication, and loading operations.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                  >
                    <option value="all">All Domains (12)</option>
                    {DOMAINS.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.key.toUpperCase()} — {d.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void jobsQ.refetch()}
                    disabled={jobsQ.isFetching}
                    className="h-9 gap-1"
                  >
                    <RotateCw className={`size-3.5 ${jobsQ.isFetching ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {jobsQ.isPending ? (
                <Loading label="Loading sync history..." />
              ) : jobsQ.isError ? (
                <ErrorState error={jobsQ.error} onRetry={() => void jobsQ.refetch()} />
              ) : jobs.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  No sync jobs found for this domain.
                </p>
              ) : (
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Domain</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Extracted</TableHead>
                        <TableHead>Loaded</TableHead>
                        <TableHead>Skipped</TableHead>
                        <TableHead>Validation</TableHead>
                        <TableHead>Strategy</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Time (IST)</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((j) => (
                        <TableRow key={j.id}>
                          <TableCell>
                            <span className="inline-flex rounded bg-[#373757]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#373757]">
                              {j.domain.toUpperCase()}
                            </span>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={j.status} />
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-slate-900">
                            {formatNumber(j.extracted)}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-emerald-700">
                            {formatNumber(j.loaded)}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-500">
                            {j.duplicates_skipped > 0 ? (
                              <span className="text-indigo-600 font-semibold">{j.duplicates_skipped} dup</span>
                            ) : (
                              "0"
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-500">
                            {j.validation_failed > 0 ? (
                              <span className="text-amber-600 font-semibold">{j.validation_failed} err</span>
                            ) : (
                              "0"
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-slate-600">
                            {j.strategy}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-500">
                            {j.duration_ms} ms
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {formatDateTime(j.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => setInspectJob(j)}
                            >
                              Inspect
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Manual Run Form */}
        <TabsContent value="manual" className="space-y-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold text-slate-900">
                  Trigger Manual Synchronization Job
                </CardTitle>
                <CardDescription>
                  Extract pending records from SAP S/4HANA, apply transformation mappings, and push to FinSight.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1.5">
                    Target ERP Domain
                  </label>
                  <select
                    value={runDomain}
                    onChange={(e) => setRunDomain(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                  >
                    {DOMAINS.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.key.toUpperCase()} — {d.name} ({d.sap_table})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1.5">
                      Batch Extraction Size
                    </label>
                    <select
                      value={batchSize}
                      onChange={(e) => setBatchSize(Number(e.target.value))}
                      className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                    >
                      <option value={10}>10 records</option>
                      <option value={25}>25 records</option>
                      <option value={50}>50 records (Standard)</option>
                      <option value={100}>100 records</option>
                      <option value={200}>200 records (Max)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-700 block mb-1.5">
                      Deduplication Strategy
                    </label>
                    <select
                      value={strategy}
                      onChange={(e) => setStrategy(e.target.value)}
                      className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                    >
                      <option value="checksum">SHA-256 Checksum (Idempotent)</option>
                      <option value="doc_id">SAP Document Key</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="reprocess-chk"
                    checked={reprocess}
                    onChange={(e) => setReprocess(e.target.checked)}
                    className="rounded border-slate-300 text-[#373757] focus:ring-slate-400"
                  />
                  <label htmlFor="reprocess-chk" className="text-xs text-slate-700 cursor-pointer">
                    Reprocess pending records (extracts newly posted & un-synced entries)
                  </label>
                </div>

                {runDomain === "ml" && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="size-3.5 text-amber-600" />
                      Notice: Material Ledger Outage Active
                    </div>
                    <p>
                      The Material Ledger circuit breaker is currently OPEN to simulate a downstream SAP RFC outage. Sync requests on ML will trigger circuit protection.
                    </p>
                  </div>
                )}

                <Button
                  onClick={() =>
                    runMutation.mutate({
                      domain: runDomain,
                      batch_size: batchSize,
                      strategy,
                      reprocess,
                    })
                  }
                  disabled={runMutation.isPending}
                  className="w-full gap-2 mt-2"
                >
                  <Play className={`size-3.5 ${runMutation.isPending ? "animate-spin" : ""}`} />
                  {runMutation.isPending ? "Running ETL Pipeline..." : "Execute Synchronization Job"}
                </Button>
              </CardContent>
            </Card>

            {/* Right: Architecture & Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold text-slate-900">
                  ETL Pipeline Architecture & Rules
                </CardTitle>
                <CardDescription>
                  Enterprise sync guarantees for Meridian Manufacturing Ltd.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-slate-600">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                    1. Idempotent Ingestion Guarantee
                  </p>
                  <p>
                    Every source payload is hashed into a SHA-256 composite checksum. Re-running sync jobs will never create duplicate documents in FinSight.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                    2. Circuit Breaker Protection
                  </p>
                  <p>
                    Inter-service communication is guarded by 3-state circuit breakers (Closed / Open / Half-Open). When error rates exceed threshold, the circuit opens to prevent cascade failure.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                    3. Dead-Letter Queue (DLQ) Quarantine
                  </p>
                  <p>
                    Invalid schemas, corrupted dates, or missing required fields bypass the target database and route immediately into the dead-letter queue for operator inspection.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 3: Schedules */}
        <TabsContent value="schedules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold text-slate-900">
                Automated ODP Sync Schedules
              </CardTitle>
              <CardDescription>
                Configure the frequency of background Operational Data Provisioning delta syncs per business domain.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {schedulesQ.isPending ? (
                <Loading label="Loading schedules..." />
              ) : schedulesQ.isError ? (
                <ErrorState error={schedulesQ.error} onRetry={() => void schedulesQ.refetch()} />
              ) : (
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Domain</TableHead>
                        <TableHead>Domain Name</TableHead>
                        <TableHead>Sync Interval</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead className="text-right">Configure Interval</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedulesQ.data.map((s) => (
                        <TableRow key={s.domain}>
                          <TableCell>
                            <span className="inline-flex rounded bg-[#373757]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#373757]">
                              {s.domain.toUpperCase()}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium text-xs text-slate-800">
                            {s.domain_name}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                                s.interval === "Paused"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-slate-200 bg-slate-50 text-slate-700"
                              }`}
                            >
                              <Clock className="size-3 text-slate-400" />
                              {s.interval}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {formatDateTime(s.updated_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <select
                              value={s.interval}
                              onChange={(e) =>
                                updateScheduleMutation.mutate({
                                  domain: s.domain,
                                  interval: e.target.value,
                                })
                              }
                              disabled={updateScheduleMutation.isPending || !isAdmin}
                              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                            >
                              {SCHEDULE_INTERVALS.map((intv) => (
                                <option key={intv} value={intv}>
                                  {intv}
                                </option>
                              ))}
                            </select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Inspect Job Dialog */}
      <Dialog open={inspectJob !== null} onOpenChange={(open: boolean) => !open && setInspectJob(null)}>
        <DialogContent className="max-w-xl">
          {inspectJob && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span>Job {inspectJob.id.slice(0, 8)}</span>
                  <StatusBadge status={inspectJob.status} />
                </DialogTitle>
                <DialogDescription>
                  {inspectJob.domain_name} ({inspectJob.domain.toUpperCase()}) Execution Summary
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-slate-200 p-2.5">
                    <span className="text-slate-500 block">Execution Mode</span>
                    <span className="font-semibold text-slate-900">{inspectJob.mode}</span>
                  </div>
                  <div className="rounded-md border border-slate-200 p-2.5">
                    <span className="text-slate-500 block">Deduplication Strategy</span>
                    <span className="font-semibold text-slate-900">{inspectJob.strategy}</span>
                  </div>
                  <div className="rounded-md border border-slate-200 p-2.5">
                    <span className="text-slate-500 block">Duration</span>
                    <span className="font-semibold text-slate-900">{inspectJob.duration_ms} ms</span>
                  </div>
                  <div className="rounded-md border border-slate-200 p-2.5">
                    <span className="text-slate-500 block">Triggered By</span>
                    <span className="font-semibold text-slate-900">{inspectJob.triggered_by_email || "System"}</span>
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-700 mb-1">Execution Metrics:</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-slate-400 block text-[10px]">Extracted</span>
                      <span className="font-bold text-slate-900">{inspectJob.extracted}</span>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-slate-400 block text-[10px]">Transformed</span>
                      <span className="font-bold text-slate-900">{inspectJob.transformed}</span>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-slate-400 block text-[10px]">Loaded</span>
                      <span className="font-bold text-emerald-700">{inspectJob.loaded}</span>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-slate-400 block text-[10px]">Skipped</span>
                      <span className="font-bold text-indigo-700">{inspectJob.duplicates_skipped}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Log Message:</p>
                  <p className="rounded-md bg-slate-900 p-2.5 font-mono text-[11px] text-slate-200">
                    {inspectJob.message}
                  </p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

