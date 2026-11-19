/** Module 5 — Financial Reconciliation: Ledger comparison, variance detection & auto-adjust. */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GitCompareArrows,
  Play,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  ShieldCheck,
  Scale,
  Wrench,
  Check,
  XCircle,
  FileCheck,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiPost } from "@/lib/api";
import { DOMAINS } from "@/lib/domains";
import type { ReconciliationRun, ReconRow } from "@/lib/types";
import { PageHeader, Loading, ErrorState, StatusBadge } from "@/components/shared";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDateTime, formatInr, formatNumber } from "@/lib/format";
import { useAuth } from "@/components/shell";

export default function Reconciliation() {
  const qc = useQueryClient();
  const user = useAuth();
  const isAdmin = user.role === "admin";

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState<string>("all");
  const [filterDomain, setFilterDomain] = useState<string>("all");
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [runDomain, setRunDomain] = useState<string>("all");

  // Fetch runs list
  const runsListQ = useQuery({
    queryKey: ["recon-runs"],
    queryFn: () => apiGet<ReconciliationRun[]>("/recon/runs?limit=15"),
    refetchInterval: 20_000,
  });

  // Effective run ID to inspect
  const currentRunId = activeRunId || runsListQ.data?.[0]?.id;

  // Fetch detailed run with rows
  const runDetailQ = useQuery({
    queryKey: ["recon-run-detail", currentRunId],
    queryFn: () => apiGet<ReconciliationRun>(`/recon/runs/${currentRunId}`),
    enabled: Boolean(currentRunId),
  });

  // Trigger New Recon Run
  const runMutation = useMutation({
    mutationFn: (body: { domain: string | null }) =>
      apiPost<ReconciliationRun>("/recon/run", body),
    onSuccess: (newRun) => {
      toast.success(
        `Reconciliation completed: ${newRun.status.replace("_", " ")} (${newRun.counts.matched || 0} matched)`
      );
      setRunModalOpen(false);
      setActiveRunId(newRun.id);
      qc.invalidateQueries({ queryKey: ["recon-runs"] });
      qc.invalidateQueries({ queryKey: ["recon-run-detail", newRun.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Reconciliation execution failed";
      toast.error(msg);
    },
  });

  // Auto-Adjust Discrepancies Mutation
  const adjustMutation = useMutation({
    mutationFn: (rid: string) =>
      apiPost<ReconciliationRun>(`/recon/runs/${rid}/adjust`),
    onSuccess: (adjustedRun) => {
      toast.success("Discrepancies automatically adjusted to SAP source truth!");
      qc.invalidateQueries({ queryKey: ["recon-runs"] });
      qc.invalidateQueries({ queryKey: ["recon-run-detail", adjustedRun.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Adjustment failed";
      toast.error(msg);
    },
  });

  const run = runDetailQ.data;
  const rows = run?.rows || [];

  // Filter rows
  const filteredRows = rows.filter((r) => {
    const matchesKind =
      filterKind === "all" ||
      (filterKind === "discrepancies" && r.kind !== "matched") ||
      r.kind === filterKind;
    const matchesDomain = filterDomain === "all" || r.domain === filterDomain;
    return matchesKind && matchesDomain;
  });

  const matchedCount = run?.counts?.matched || 0;
  const mismatchCount = run?.counts?.mismatch || 0;
  const missingCount = run?.counts?.missing_in_destination || 0;
  const totalCount = run?.counts?.total || 0;
  const varianceInr = run?.totals?.variance_inr || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Reconciliation & Audit Engine"
        description="Continuous mathematical verification comparing SAP S/4HANA source documents against FinSight destination records to guarantee zero data loss."
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runsListQ.refetch()}
            disabled={runsListQ.isFetching}
            className="gap-1.5"
          >
            <RotateCw className={`size-3.5 ${runsListQ.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setRunModalOpen(true)}
            className="gap-1.5"
          >
            <Play className="size-3.5" />
            Run Reconciliation
          </Button>
        </div>
      </PageHeader>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Matched Records</span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-emerald-700">
            {formatNumber(matchedCount)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {totalCount ? `${Math.round((matchedCount / totalCount) * 100)}% of compared entries` : "Zero breaks"}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Value Discrepancies</span>
            <AlertTriangle className="size-4 text-red-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-red-600">
            {formatNumber(mismatchCount)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Amount / calculation mismatches</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Missing in FinSight</span>
            <XCircle className="size-4 text-amber-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-amber-600">
            {formatNumber(missingCount)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Extracted but not loaded</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Debit / Credit Net Variance</span>
            <Scale className="size-4 text-slate-400" />
          </div>
          <p className={`mt-2 font-mono text-lg font-bold ${Math.abs(varianceInr) < 0.01 ? "text-emerald-700" : "text-red-600"}`}>
            {formatInr(varianceInr)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {Math.abs(varianceInr) < 0.01 ? "Perfect balance" : "Discrepancy threshold exceeded"}
          </p>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="space-y-6">
        {/* Active Run Banner & Actions */}
        {run && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold text-slate-900">
                      Reconciliation Run #{run.id.slice(0, 8)}
                    </CardTitle>
                    <StatusBadge status={run.status} />
                    {run.adjusted && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <Check className="size-3" /> Auto-Adjusted
                      </span>
                    )}
                  </div>
                  <CardDescription>
                    Executed on {formatDateTime(run.created_at)} · Scope: {run.scope.toUpperCase()} · Duration: {run.duration_ms} ms
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  {mismatchCount > 0 && !run.adjusted && (
                    <Button
                      size="sm"
                      onClick={() => adjustMutation.mutate(run.id)}
                      disabled={adjustMutation.isPending || !isAdmin}
                      className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      <Wrench className={`size-3.5 ${adjustMutation.isPending ? "animate-spin" : ""}`} />
                      {adjustMutation.isPending ? "Adjusting..." : "Auto-Adjust Discrepancies"}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Financial Balance Comparison */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
                <div>
                  <span className="text-slate-500 block font-medium">SAP S/4HANA Source Total</span>
                  <div className="mt-1 space-y-0.5 font-mono text-slate-800">
                    <p>Debits: {formatInr(run.totals?.source_debit_total_inr)}</p>
                    <p>Credits: {formatInr(run.totals?.source_credit_total_inr)}</p>
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block font-medium">FinSight Analytics Total</span>
                  <div className="mt-1 space-y-0.5 font-mono text-slate-800">
                    <p>Debits: {formatInr(run.totals?.dest_debit_total_inr)}</p>
                    <p>Credits: {formatInr(run.totals?.dest_credit_total_inr)}</p>
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block font-medium">Reconciliation Verdict</span>
                  <div className="mt-1">
                    {run.status === "reconciled" ? (
                      <p className="font-semibold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="size-4" /> Zero-Break Integrity
                      </p>
                    ) : (
                      <p className="font-semibold text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="size-4" /> Exceptions Detected
                      </p>
                    )}
                    <p className="text-slate-500 mt-1">
                      Auditor sign-off ready (Schedule III & GST Rule 36)
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rows & Discrepancies Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Itemized Document Audit Trail ({filteredRows.length})
                </CardTitle>
                <CardDescription>
                  Document-by-document comparison of amounts, GST calculations, and posting directions.
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filterKind}
                  onChange={(e) => setFilterKind(e.target.value)}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                >
                  <option value="all">All Records</option>
                  <option value="discrepancies">All Exceptions ({mismatchCount + missingCount})</option>
                  <option value="mismatch">Mismatches Only ({mismatchCount})</option>
                  <option value="missing_in_destination">Missing in FinSight ({missingCount})</option>
                  <option value="matched">Matched ({matchedCount})</option>
                </select>

                <select
                  value={filterDomain}
                  onChange={(e) => setFilterDomain(e.target.value)}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                >
                  <option value="all">All Domains</option>
                  {DOMAINS.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.key.toUpperCase()} — {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {runDetailQ.isPending ? (
              <Loading label="Loading reconciliation audit rows..." />
            ) : runDetailQ.isError ? (
              <ErrorState error={runDetailQ.error} onRetry={() => void runDetailQ.refetch()} />
            ) : filteredRows.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">
                No records matching current filter.
              </p>
            ) : (
              <div className="rounded-md border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Domain</TableHead>
                      <TableHead>SAP Doc No</TableHead>
                      <TableHead>FinSight Ref</TableHead>
                      <TableHead>Plant / Party</TableHead>
                      <TableHead className="text-right">SAP Amount (₹)</TableHead>
                      <TableHead className="text-right">FinSight Amount (₹)</TableHead>
                      <TableHead className="text-right">Variance (₹)</TableHead>
                      <TableHead className="text-center w-28">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <span className="inline-flex rounded bg-[#373757]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#373757]">
                            {r.domain.toUpperCase()}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-slate-900">
                          {r.sap_doc_no}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-indigo-700">
                          {r.finsight_ref || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          <span className="font-semibold text-slate-800">{r.plant_code}</span>
                          {r.party_name ? ` · ${r.party_name}` : ""}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-slate-900">
                          {r.source_amount_inr !== null ? formatInr(r.source_amount_inr) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-slate-900">
                          {r.dest_amount_inr !== null ? formatInr(r.dest_amount_inr) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {r.delta_inr !== null && r.delta_inr !== 0 ? (
                            <span className="text-red-600 font-semibold">{formatInr(r.delta_inr)}</span>
                          ) : (
                            <span className="text-slate-400">₹0.00</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.kind === "matched" && (
                            <span className="inline-flex rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              Matched
                            </span>
                          )}
                          {r.kind === "mismatch" && (
                            <span className="inline-flex rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                              Mismatch
                            </span>
                          )}
                          {r.kind === "missing_in_destination" && (
                            <span className="inline-flex rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              Missing
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Historical Reconciliation Runs Log */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-900">
              Historical Reconciliation Runs
            </CardTitle>
            <CardDescription>
              Archive of past reconciliation audits and variance sign-offs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {runsListQ.data && (
              <div className="rounded-md border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run ID</TableHead>
                      <TableHead>Timestamp (IST)</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Matched</TableHead>
                      <TableHead>Discrepancies</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runsListQ.data.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs font-semibold text-slate-800">
                          {r.id.slice(0, 8)}...
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {formatDateTime(r.created_at)}
                        </TableCell>
                        <TableCell className="font-mono text-xs uppercase text-slate-700">
                          {r.scope}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-emerald-700">
                          {formatNumber(r.counts?.matched || 0)}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-red-600">
                          {(r.counts?.mismatch || 0) + (r.counts?.missing_in_destination || 0)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-[11px]"
                            onClick={() => setActiveRunId(r.id)}
                          >
                            Inspect Run
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
      </div>

      {/* Trigger New Recon Run Dialog */}
      <Dialog open={runModalOpen} onOpenChange={(open: boolean) => !open && setRunModalOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Execute Reconciliation Audit</DialogTitle>
            <DialogDescription>
              Select domain scope to calculate debit/credit balance comparisons against FinSight.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1.5">
                Reconciliation Scope
              </label>
              <select
                value={runDomain}
                onChange={(e) => setRunDomain(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              >
                <option value="all">All Domains (Comprehensive Enterprise Audit)</option>
                {DOMAINS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.key.toUpperCase()} — {d.name}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-slate-500">
              The engine will scan all extracted SAP documents, verify destination hashes, compare net/gross amounts, and log discrepancies into the audit trail.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setRunModalOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  runMutation.mutate({ domain: runDomain === "all" ? null : runDomain })
                }
                disabled={runMutation.isPending}
                className="gap-1.5"
              >
                <Play className={`size-3.5 ${runMutation.isPending ? "animate-spin" : ""}`} />
                {runMutation.isPending ? "Running..." : "Start Reconciliation"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
