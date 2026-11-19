/** Module 6 — Error Management: Circuit Breakers, Retry Policies, Error Taxonomy, and DLQ. */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert,
  Zap,
  RotateCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Inbox,
  Clock,
  Layers,
  ArrowRight,
  Filter,
  Check,
  Edit,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiPost } from "@/lib/api";
import { DOMAINS } from "@/lib/domains";
import type { CircuitBreaker, ErrorRecord } from "@/lib/types";
import { PageHeader, Loading, ErrorState, StatusBadge, JsonViewer } from "@/components/shared";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useAuth } from "@/components/shell";

interface ErrorPageData {
  items: ErrorRecord[];
  counts: Record<string, number>;
}

export default function ErrorManagement() {
  const qc = useQueryClient();
  const user = useAuth();
  const isAdmin = user.role === "admin";

  const [selectedClassification, setSelectedClassification] = useState<string>("all");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");

  // Inspection & DLQ Requeue Modal
  const [inspectError, setInspectError] = useState<ErrorRecord | null>(null);
  const [patchAmount, setPatchAmount] = useState<string>("");
  const [patchGstin, setPatchGstin] = useState<string>("");
  const [patchDate, setPatchDate] = useState<string>("");

  // Query Circuit Breakers
  const breakersQ = useQuery({
    queryKey: ["circuit-breakers"],
    queryFn: () => apiGet<CircuitBreaker[]>("/errors/circuit-breakers"),
    refetchInterval: 15_000,
  });

  // Query Errors
  const errorsQ = useQuery({
    queryKey: ["errors-list", selectedClassification, selectedDomain],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "60" });
      if (selectedClassification !== "all") params.append("classification", selectedClassification);
      if (selectedDomain !== "all") params.append("domain", selectedDomain);
      return apiGet<ErrorPageData>(`/errors?${params.toString()}`);
    },
    refetchInterval: 15_000,
  });

  // Query DLQ
  const dlqQ = useQuery({
    queryKey: ["errors-dlq"],
    queryFn: () => apiGet<ErrorRecord[]>("/errors/dlq"),
    refetchInterval: 15_000,
  });

  // Reset Circuit Breaker Mutation
  const resetBreakerMutation = useMutation({
    mutationFn: (domain: string) =>
      apiPost<CircuitBreaker>(`/errors/circuit-breakers/${domain}/reset`),
    onSuccess: (updated) => {
      toast.success(`Circuit breaker for ${updated.domain.toUpperCase()} closed & reset`);
      qc.invalidateQueries({ queryKey: ["circuit-breakers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to reset breaker";
      toast.error(msg);
    },
  });

  // Retry Non-DLQ Error Mutation
  const retryErrorMutation = useMutation({
    mutationFn: (eid: string) => apiPost<ErrorRecord>(`/errors/${eid}/retry`),
    onSuccess: (updated) => {
      if (updated.status === "resolved") {
        toast.success(`Error resolved successfully on attempt #${updated.attempts}`);
      } else {
        toast.info(`Retry initiated (Attempt #${updated.attempts}) — Status: ${updated.status}`);
      }
      qc.invalidateQueries({ queryKey: ["errors-list"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Retry failed";
      toast.error(msg);
    },
  });

  // Requeue DLQ Record Mutation
  const requeueMutation = useMutation({
    mutationFn: ({
      eid,
      patched,
    }: {
      eid: string;
      patched: Record<string, unknown>;
    }) => apiPost<ErrorRecord>(`/errors/dlq/${eid}/requeue`, { patched_payload: patched }),
    onSuccess: (updated) => {
      toast.success(`Record requeued to pipeline (Result: ${updated.status})`);
      setInspectError(null);
      qc.invalidateQueries({ queryKey: ["errors-dlq"] });
      qc.invalidateQueries({ queryKey: ["errors-list"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Requeue failed";
      toast.error(msg);
    },
  });

  const breakers = breakersQ.data || [];
  const openBreakers = breakers.filter((b) => b.state !== "closed");
  const dlqRecords = dlqQ.data || [];
  const totalErrors = errorsQ.data?.items.length || 0;
  const classificationCounts = errorsQ.data?.counts || {};

  const handleOpenInspect = (err: ErrorRecord) => {
    setInspectError(err);
    const snap = err.payload_snapshot || {};
    setPatchAmount(snap.amount !== undefined ? String(snap.amount) : "10000");
    setPatchGstin(snap.party_gstin ? String(snap.party_gstin) : "27AAACM1234F1Z5");
    setPatchDate(snap.sap_doc_date ? String(snap.sap_doc_date) : "20260115");
  };

  const handleExecuteRequeue = () => {
    if (!inspectError) return;
    const patch: Record<string, unknown> = {};
    if (patchAmount) patch.amount = parseFloat(patchAmount);
    if (patchGstin) patch.party_gstin = patchGstin;
    if (patchDate) patch.sap_doc_date = patchDate;
    requeueMutation.mutate({ eid: inspectError.id, patched: patch });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Error Management & Circuit Breakers"
        description="3-state circuit breakers (Closed / Open / Half-Open), automated exponential backoff retries, and quarantine inspection for the Dead-Letter Queue (DLQ)."
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-xs">
          <ShieldAlert className="size-3.5 text-[#373757]" />
          Zero-Cascade Failure Protection
        </span>
      </PageHeader>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Circuit Breakers</span>
            <Zap className={`size-4 ${openBreakers.length > 0 ? "text-amber-500" : "text-emerald-500"}`} />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900">
            {breakers.length - openBreakers.length}/{breakers.length} Closed
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {openBreakers.length > 0 ? (
              <span className="text-red-600 font-semibold">{openBreakers.length} circuit(s) OPEN</span>
            ) : (
              "All domains healthy"
            )}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Dead-Letter Queue (DLQ)</span>
            <Inbox className="size-4 text-red-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-red-600">
            {dlqRecords.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Quarantined for operator intervention</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Validation Errors</span>
            <AlertTriangle className="size-4 text-amber-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-amber-600">
            {classificationCounts["validation_error"] || 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">GSTIN / date schema mismatches</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Network / Transient Timeouts</span>
            <Clock className="size-4 text-indigo-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-indigo-700">
            {classificationCounts["network_timeout"] || 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">Auto-retry with exponential jitter</p>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="breakers">
        <TabsList className="bg-slate-200/70 p-1">
          <TabsTrigger value="breakers">Circuit Breakers ({breakers.length})</TabsTrigger>
          <TabsTrigger value="errors">Error Registry & Retries ({totalErrors})</TabsTrigger>
          <TabsTrigger value="dlq">Dead-Letter Queue ({dlqRecords.length})</TabsTrigger>
        </TabsList>

        {/* Tab 1: Circuit Breaker Matrix */}
        <TabsContent value="breakers" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Inter-Service Circuit Breaker Matrix
                  </CardTitle>
                  <CardDescription>
                    Monitors consecutive failures across all 12 SAP extraction streams. Trips open after 5 consecutive failures.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void breakersQ.refetch()}
                  disabled={breakersQ.isFetching}
                  className="gap-1.5"
                >
                  <RotateCw className={`size-3.5 ${breakersQ.isFetching ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {breakersQ.isPending ? (
                <Loading label="Inspecting circuit breakers..." />
              ) : breakersQ.isError ? (
                <ErrorState error={breakersQ.error} onRetry={() => void breakersQ.refetch()} />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {breakers.map((b) => {
                    const isOpen = b.state === "open";
                    const isHalfOpen = b.state === "half_open";
                    return (
                      <div
                        key={b.key}
                        className={`rounded-lg border p-4 transition-all ${
                          isOpen
                            ? "border-red-300 bg-red-50/50 shadow-xs"
                            : isHalfOpen
                            ? "border-amber-300 bg-amber-50/50 shadow-xs"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-slate-800 uppercase">
                            {b.domain} — {DOMAINS.find((d) => d.key === b.domain)?.name || b.domain}
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              isOpen
                                ? "bg-red-100 text-red-800 border border-red-200"
                                : isHalfOpen
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            }`}
                          >
                            {b.state}
                          </span>
                        </div>

                        <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Endpoint:</span>
                            <span className="font-mono font-medium text-slate-700">{b.endpoint_key || "SAP-RFC"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Failures:</span>
                            <span className="font-mono font-semibold text-slate-800">
                              {b.consecutive_failures} consecutive (Total: {b.total_failures})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Target Endpoint:</span>
                            <span className="text-slate-700 font-medium capitalize">{b.endpoint_status || "Healthy"}</span>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="mt-4 pt-3 border-t border-red-200">
                            <Button
                              size="sm"
                              onClick={() => resetBreakerMutation.mutate(b.domain)}
                              disabled={resetBreakerMutation.isPending || !isAdmin}
                              className="w-full h-7 bg-red-600 hover:bg-red-700 text-white text-xs gap-1.5"
                            >
                              <RotateCw className="size-3" />
                              Reset Circuit Breaker
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Error Registry */}
        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Integration Exceptions & Retry Audit
                  </CardTitle>
                  <CardDescription>
                    All runtime errors encountered during SAP extraction and transformation with retry policies.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedClassification}
                    onChange={(e) => setSelectedClassification(e.target.value)}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                  >
                    <option value="all">All Classifications</option>
                    <option value="validation_error">Validation Errors</option>
                    <option value="network_timeout">Network Timeouts</option>
                    <option value="schema_mismatch">Schema Mismatches</option>
                  </select>

                  <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
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
              {errorsQ.isPending ? (
                <Loading label="Loading exceptions..." />
              ) : errorsQ.isError ? (
                <ErrorState error={errorsQ.error} onRetry={() => void errorsQ.refetch()} />
              ) : (errorsQ.data?.items || []).length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  No errors found matching filter criteria.
                </p>
              ) : (
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Domain</TableHead>
                        <TableHead>Doc No</TableHead>
                        <TableHead>Classification</TableHead>
                        <TableHead>Exception Message</TableHead>
                        <TableHead className="text-center">Attempts</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Logged (IST)</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {errorsQ.data?.items.map((err) => (
                        <TableRow key={err.id}>
                          <TableCell>
                            <span className="inline-flex rounded bg-[#373757]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#373757]">
                              {err.domain ? err.domain.toUpperCase() : "—"}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-slate-900">
                            {err.source_doc_no || "—"}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700">
                              {err.classification}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-slate-700 max-w-xs truncate" title={err.message}>
                            {err.message}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs text-slate-700 font-semibold">
                            {err.attempts}/3
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={err.status} />
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {formatDateTime(err.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            {err.dead_letter ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px] text-red-600 border-red-200"
                                onClick={() => handleOpenInspect(err)}
                              >
                                Fix in DLQ
                              </Button>
                            ) : err.status !== "resolved" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => retryErrorMutation.mutate(err.id)}
                                disabled={retryErrorMutation.isPending || !isAdmin}
                              >
                                Retry
                              </Button>
                            ) : (
                              <span className="text-[11px] text-emerald-600 font-medium">Resolved</span>
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
        </TabsContent>

        {/* Tab 3: Dead-Letter Queue */}
        <TabsContent value="dlq" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Dead-Letter Queue Quarantine ({dlqRecords.length})
                  </CardTitle>
                  <CardDescription>
                    Records parked after 3 failed retries or irrecoverable validation errors. Inspect, patch fields, and requeue.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void dlqQ.refetch()}
                  disabled={dlqQ.isFetching}
                  className="gap-1.5"
                >
                  <RotateCw className={`size-3.5 ${dlqQ.isFetching ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {dlqQ.isPending ? (
                <Loading label="Loading DLQ records..." />
              ) : dlqQ.isError ? (
                <ErrorState error={dlqQ.error} onRetry={() => void dlqQ.refetch()} />
              ) : dlqRecords.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <CheckCircle2 className="size-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-semibold text-slate-800">Dead-Letter Queue is empty</p>
                  <p className="text-xs text-slate-400 mt-1">Zero unresolvable documents quarantined.</p>
                </div>
              ) : (
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Domain</TableHead>
                        <TableHead>Doc No</TableHead>
                        <TableHead>Failure Reason</TableHead>
                        <TableHead>Quarantined At</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dlqRecords.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <span className="inline-flex rounded bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 font-mono text-[11px] font-bold">
                              {item.domain ? item.domain.toUpperCase() : "SAP"}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-slate-900">
                            {item.source_doc_no || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-red-700 font-medium">
                            {item.message}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {formatDateTime(item.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-[11px] bg-[#373757] text-white"
                              onClick={() => handleOpenInspect(item)}
                            >
                              Inspect & Fix
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
      </Tabs>

      {/* Inspect & Patch Modal */}
      <Dialog open={inspectError !== null} onOpenChange={(open: boolean) => !open && setInspectError(null)}>
        <DialogContent className="max-w-xl">
          {inspectError && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span>DLQ Document: {inspectError.source_doc_no || inspectError.id.slice(0, 8)}</span>
                  <span className="rounded bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 text-xs font-semibold">
                    Quarantined
                  </span>
                </DialogTitle>
                <DialogDescription>
                  {inspectError.domain_name} ({inspectError.domain?.toUpperCase()}) · {inspectError.classification}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-xs">
                {/* Error Banner */}
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
                  <p className="font-semibold text-red-900">Rejection Cause:</p>
                  <p className="mt-0.5">{inspectError.message}</p>
                </div>

                {/* Patch Form */}
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Edit className="size-3.5 text-indigo-600" />
                    Data Quality Remediation (Patch Source Record):
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-600 block mb-1 font-medium">Correct Gross Amount (₹)</label>
                      <Input
                        value={patchAmount}
                        onChange={(e) => setPatchAmount(e.target.value)}
                        placeholder="e.g. 50000.00"
                        className="h-8 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-slate-600 block mb-1 font-medium">Party GSTIN (15 chars)</label>
                      <Input
                        value={patchGstin}
                        onChange={(e) => setPatchGstin(e.target.value)}
                        placeholder="e.g. 27AAACM1234F1Z5"
                        className="h-8 text-xs bg-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-600 block mb-1 font-medium">SAP Doc Date (YYYYMMDD)</label>
                    <Input
                      value={patchDate}
                      onChange={(e) => setPatchDate(e.target.value)}
                      placeholder="e.g. 20260115"
                      className="h-8 text-xs bg-white font-mono w-48"
                    />
                  </div>
                </div>

                {/* Raw Payload Snapshot */}
                <div>
                  <p className="font-semibold text-slate-700 mb-1">Payload Snapshot:</p>
                  <JsonViewer data={inspectError.payload_snapshot} />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setInspectError(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleExecuteRequeue}
                    disabled={requeueMutation.isPending || !isAdmin}
                    className="gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
                  >
                    <Check className={`size-3.5 ${requeueMutation.isPending ? "animate-spin" : ""}`} />
                    {requeueMutation.isPending ? "Requeueing..." : "Apply Patch & Requeue Record"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
