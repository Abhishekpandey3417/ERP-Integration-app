/** Module 3 — Data Transformation: Field Mappings, Transformation Sandbox, and FX Rates. */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shuffle,
  Play,
  RotateCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  FileCode,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiPost } from "@/lib/api";
import { DOMAINS } from "@/lib/domains";
import type { FieldMapping, FxRates, SandboxResult } from "@/lib/types";
import { PageHeader, Loading, ErrorState, JsonViewer } from "@/components/shared";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/format";

const SAMPLE_PAYLOADS: Record<string, Record<string, unknown>> = {
  gl: {
    BELNR: "0100091823",
    BUDAT: "20260115",
    POPER: "010",
    BUKRS: "1000",
    WERKS: "PL-101",
    NAME1: "Mahindra Aerospace Ltd",
    STCEG: "27AAACM1234F1Z5",
    WAERS: "USD",
    WRBTR: 45120.75,
    SHKZG: "S",
    KOSTL: "0000010101",
    PRCTR: "0000002001",
    HKONT: "0000400000",
  },
  ap: {
    BELNR: "5100048291",
    BUDAT: "20260120",
    POPER: "010",
    BUKRS: "1000",
    WERKS: "PL-102",
    NAME1: "Tata Steel Processing",
    STCEG: "33AAACT1982A1Z1",
    WAERS: "INR",
    WRBTR: 890450.0,
    SHKZG: "H",
    CGST_AMT: 80140.5,
    SGST_AMT: 80140.5,
    IGST_AMT: 0.0,
    KOSTL: "0000010201",
    PRCTR: "0000002002",
  },
  so: {
    BELNR: "0090012384",
    BUDAT: "20260122",
    POPER: "010",
    BUKRS: "1000",
    WERKS: "PL-103",
    NAME1: "Bajaj Auto OEM Division",
    STCEG: "24AAACB3981G1Z3",
    WAERS: "INR",
    WRBTR: 1250000.0,
    SHKZG: "S",
    CGST_AMT: 112500.0,
    SGST_AMT: 112500.0,
    IGST_AMT: 0.0,
    PRCTR: "0000002003",
  },
  po: {
    BELNR: "4500019284",
    BUDAT: "20260118",
    POPER: "010",
    BUKRS: "1000",
    WERKS: "PL-101",
    NAME1: "Bharat Forge Precision",
    STCEG: "27AAACB2819F1Z9",
    WAERS: "EUR",
    WRBTR: 18500.0,
    SHKZG: "S",
    MATNR: "MAT-ENG-001",
    MENGE: 500,
    MEINS: "EA",
    KOSTL: "0000010101",
  },
};

export default function DataTransformation() {
  const qc = useQueryClient();
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  // Sandbox state
  const [sandboxDomain, setSandboxDomain] = useState<string>("gl");
  const [sandboxJson, setSandboxJson] = useState<string>(
    JSON.stringify(SAMPLE_PAYLOADS.gl, null, 2)
  );

  const mappingsQ = useQuery({
    queryKey: ["field-mappings"],
    queryFn: () => apiGet<FieldMapping[]>("/mappings"),
  });

  const fxQ = useQuery({
    queryKey: ["fx-rates"],
    queryFn: () => apiGet<FxRates>("/mappings/fx"),
  });

  const testMutation = useMutation({
    mutationFn: (body: { domain: string; payload: Record<string, unknown> }) =>
      apiPost<SandboxResult>("/mappings/test", body),
    onSuccess: (res) => {
      if (res.issues.length === 0) {
        toast.success("Transformation completed with zero validation issues");
      } else {
        toast.warning(`Transformation completed with ${res.issues.length} validation issues`);
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Transformation test failed";
      toast.error(msg);
    },
  });

  const refreshFxMutation = useMutation({
    mutationFn: () => apiPost<{ ok: boolean; synced_at: string }>("/mappings/fx/refresh"),
    onSuccess: () => {
      toast.success("RBI reference FX snapshot refreshed");
      qc.invalidateQueries({ queryKey: ["fx-rates"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to refresh FX";
      toast.error(msg);
    },
  });

  const handleDomainChange = (domain: string) => {
    setSandboxDomain(domain);
    const sample = SAMPLE_PAYLOADS[domain] || {
      BELNR: "0100091823",
      BUDAT: "20260115",
      POPER: "010",
      BUKRS: "1000",
      WERKS: "PL-101",
      NAME1: "Sample Partner Ltd",
      STCEG: "27AAACM1234F1Z5",
      WAERS: "INR",
      WRBTR: 25000.0,
      SHKZG: "S",
    };
    setSandboxJson(JSON.stringify(sample, null, 2));
  };

  const handleRunSandbox = () => {
    try {
      const parsed = JSON.parse(sandboxJson);
      testMutation.mutate({ domain: sandboxDomain, payload: parsed });
    } catch {
      toast.error("Invalid JSON format in SAP payload editor");
    }
  };

  // Filter mappings
  const allMappings = mappingsQ.data || [];
  const filteredMappings = allMappings.filter((m) => {
    const matchesDomain = selectedDomain === "all" || m.domain === selectedDomain;
    const matchesSearch =
      search === "" ||
      m.sap_field.toLowerCase().includes(search.toLowerCase()) ||
      m.finsight_field.toLowerCase().includes(search.toLowerCase()) ||
      m.transform.toLowerCase().includes(search.toLowerCase()) ||
      m.domain_name.toLowerCase().includes(search.toLowerCase());
    return matchesDomain && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Transformation & Field Mappings"
        description="ETL mappings, currency consolidation engine (RBI reference rates), and interactive transformation validation sandbox."
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-xs">
          <Shuffle className="size-3.5 text-[#373757]" />
          85 Active Rules · 12 Domains
        </span>
      </PageHeader>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Field Mappings</span>
            <Layers className="size-4 text-slate-400" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900">{allMappings.length}</p>
          <p className="mt-1 text-xs text-slate-500">Across 12 SAP S/4HANA source domains</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Consolidation Currency</span>
            <span className="font-mono text-xs font-bold text-[#373757]">INR (₹)</span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-emerald-700">6 Currencies</p>
          <p className="mt-1 text-xs text-slate-500">USD, EUR, GBP, JPY, AED to INR</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Transformation Standards</span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-base font-bold text-slate-900">GST + FY Calendar</p>
          <p className="mt-1 text-xs text-slate-500">15-digit GSTIN + Indian FY (Apr-Mar)</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">FX Rate Feed</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshFxMutation.mutate()}
              disabled={refreshFxMutation.isPending}
              className="h-6 gap-1 px-2 text-[10px]"
            >
              <RotateCw className={`size-3 ${refreshFxMutation.isPending ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <p className="mt-2 font-mono text-sm font-semibold text-slate-800">
            USD: ₹{fxQ.data?.rates.find((r) => r.currency === "USD")?.rate_to_inr ?? 83.45}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {fxQ.data?.synced_at ? `Synced: ${formatDateTime(fxQ.data.synced_at)}` : "Live feed active"}
          </p>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="catalog">
        <TabsList className="bg-slate-200/70 p-1">
          <TabsTrigger value="catalog">Field Mappings Catalog ({filteredMappings.length})</TabsTrigger>
          <TabsTrigger value="sandbox">Transformation Sandbox</TabsTrigger>
          <TabsTrigger value="fx">RBI Reference FX Rates</TabsTrigger>
        </TabsList>

        {/* Tab 1: Mappings Catalog */}
        <TabsContent value="catalog" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Source-to-Target Field Mapping Registry
                  </CardTitle>
                  <CardDescription>
                    Field extraction, normalization, and business logic mapping SAP S/4HANA OData schemas to FinSight.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
                    <Input
                      placeholder="Search field or rule..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-9 w-60 pl-8 text-xs"
                    />
                  </div>
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
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {mappingsQ.isPending ? (
                <Loading label="Loading field mappings..." />
              ) : mappingsQ.isError ? (
                <ErrorState error={mappingsQ.error} onRetry={() => void mappingsQ.refetch()} />
              ) : filteredMappings.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  No field mappings found matching your criteria.
                </p>
              ) : (
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Domain</TableHead>
                        <TableHead>SAP Source Field</TableHead>
                        <TableHead>FinSight Field</TableHead>
                        <TableHead>Transformation Rule</TableHead>
                        <TableHead>Transformation Sample</TableHead>
                        <TableHead className="text-center w-24">Required</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMappings.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>
                            <span className="inline-flex rounded bg-[#373757]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#373757]">
                              {m.domain.toUpperCase()}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-slate-800">
                            {m.sap_field}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-indigo-700">
                            {m.finsight_field}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                              {m.transform}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-slate-500">
                            {m.sample}
                          </TableCell>
                          <TableCell className="text-center">
                            {m.required ? (
                              <span className="inline-flex rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                Required
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-slate-50 border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500">
                                Optional
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
        </TabsContent>

        {/* Tab 2: Interactive Sandbox */}
        <TabsContent value="sandbox" className="space-y-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left: Input Payload & Domain */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900">
                      SAP Source Payload Input
                    </CardTitle>
                    <CardDescription>
                      Simulate arbitrary SAP S/4HANA records through the ETL engine.
                    </CardDescription>
                  </div>
                  <select
                    value={sandboxDomain}
                    onChange={(e) => handleDomainChange(e.target.value)}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-xs"
                  >
                    {DOMAINS.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.name} ({d.key.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>SAP Payload JSON (OData format)</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDomainChange(sandboxDomain)}
                      className="text-indigo-600 hover:underline"
                    >
                      Reset Sample
                    </button>
                  </div>
                </div>

                <textarea
                  value={sandboxJson}
                  onChange={(e) => setSandboxJson(e.target.value)}
                  rows={14}
                  className="w-full rounded-md border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-5 text-emerald-400 shadow-inner focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                  spellCheck={false}
                />

                <Button
                  onClick={handleRunSandbox}
                  disabled={testMutation.isPending}
                  className="w-full gap-2"
                >
                  <Play className={`size-3.5 ${testMutation.isPending ? "animate-spin" : ""}`} />
                  {testMutation.isPending ? "Executing Transformation..." : "Run Transformation Pipeline"}
                </Button>
              </CardContent>
            </Card>

            {/* Right: Transformation Results & Execution Steps */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-bold text-slate-900">
                      Transformation Results
                    </CardTitle>
                    {testMutation.data ? (
                      testMutation.data.issues.length === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                          Passed Validation
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          <AlertTriangle className="size-3.5 text-amber-600" />
                          {testMutation.data.issues.length} Validation Issue(s)
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-slate-400">Awaiting execution</span>
                    )}
                  </div>
                  <CardDescription>
                    Normalized FinSight target output and step-by-step transformation trace.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!testMutation.data && !testMutation.isPending && (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                      <FileCode className="size-10 stroke-1 text-slate-300 mb-2" />
                      <p className="text-sm font-medium">No transformation executed yet</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Click "Run Transformation Pipeline" to preview converted records.
                      </p>
                    </div>
                  )}

                  {testMutation.isPending && <Loading label="Processing transformation rules..." />}

                  {testMutation.data && (
                    <>
                      {/* Issues list if any */}
                      {testMutation.data.issues.length > 0 && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs space-y-1.5">
                          <p className="font-semibold text-amber-900">Validation Warnings / Errors:</p>
                          {testMutation.data.issues.map((iss, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-amber-800">
                              <span className="font-mono font-bold">[{iss.code}]</span>
                              <span>{iss.field}: {iss.message}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Execution Steps */}
                      <div>
                        <p className="text-xs font-semibold text-slate-700 mb-2">Applied Transformation Steps:</p>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border border-slate-100 bg-slate-50 p-2.5 text-xs">
                          {testMutation.data.steps.map((st, i) => (
                            <div key={i} className="flex items-center gap-2 font-mono text-[11px] text-slate-700">
                              <span className="text-slate-400">#{i + 1}</span>
                              <span className="font-semibold text-indigo-700">{st.field}</span>
                              <span className="text-slate-400">→</span>
                              <span className="rounded bg-slate-200/80 px-1.5 py-0.2 text-slate-800">{st.rule}</span>
                              <span className="truncate text-slate-500">({st.detail})</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* FinSight JSON Output */}
                      <div>
                        <p className="text-xs font-semibold text-slate-700 mb-2">FinSight Destination Record:</p>
                        <JsonViewer data={testMutation.data.dest} />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: FX Rates */}
        <TabsContent value="fx" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    RBI Reference Currency Conversion Table
                  </CardTitle>
                  <CardDescription>
                    All multi-currency foreign postings are consolidated into Indian Rupee (INR ₹) using official daily reference rates.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refreshFxMutation.mutate()}
                  disabled={refreshFxMutation.isPending}
                  className="gap-1.5 self-start sm:self-auto"
                >
                  <RotateCw className={`size-3.5 ${refreshFxMutation.isPending ? "animate-spin" : ""}`} />
                  Refresh Rates Snapshot
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {fxQ.isPending ? (
                <Loading label="Fetching FX rates..." />
              ) : fxQ.isError ? (
                <ErrorState error={fxQ.error} onRetry={() => void fxQ.refetch()} />
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                    {fxQ.data.rates.map((r) => (
                      <div
                        key={r.currency}
                        className="rounded-lg border border-slate-200 bg-white p-4 text-center shadow-xs"
                      >
                        <span className="inline-block rounded-md bg-[#373757]/10 px-2 py-0.5 font-mono text-xs font-bold text-[#373757]">
                          1 {r.currency}
                        </span>
                        <p className="mt-2 font-mono text-xl font-bold text-slate-900">
                          ₹{r.rate_to_inr.toFixed(2)}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">Consolidated to INR</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                      <TrendingUp className="size-4 text-emerald-600" />
                      Conversion Governance & Compliance
                    </div>
                    <p>
                      • Feed source: <span className="font-medium text-slate-900">{fxQ.data.source}</span>
                    </p>
                    <p>
                      • In accordance with RBI Foreign Exchange Management Act (FEMA) guidelines, all transactions across overseas vendors, foreign buyers, and cross-border bank statements are automatically normalized to INR base amounts while retaining original source amounts (`source_amount` & `source_currency`).
                    </p>
                    <p>
                      • Last synced: <span className="font-mono text-slate-800">{fxQ.data.synced_at ? formatDateTime(fxQ.data.synced_at) : "Active"}</span>
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

