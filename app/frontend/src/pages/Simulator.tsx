/** Module 2 — SAP ERP Simulator: 12 domains, mock batch generation, source record browser. */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileJson, Play } from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiPost } from "@/lib/api";
import { PLANTS } from "@/lib/domains";
import type { DomainStat, RecordPage, SimulatorMeta, SourceRecord } from "@/lib/types";
import { useAuth } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, JsonViewer, Loading, PageHeader, StatusBadge } from "@/components/shared";
import { formatDateTime, formatInr, formatNumber } from "@/lib/format";

export default function Simulator() {
    const { user } = useAuth();
    const isAdmin = user.role === "admin";
    const qc = useQueryClient();

    const [domain, setDomain] = useState("gl");
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");
    const [plant, setPlant] = useState("all");
    const [page, setPage] = useState(1);
    const [count, setCount] = useState("50");
    const [payloadFor, setPayloadFor] = useState<SourceRecord | null>(null);

    const domainsQ = useQuery({ queryKey: ["simulator-domains"], queryFn: () => apiGet<DomainStat[]>("/simulator/domains") });
    const recordsQ = useQuery({
        queryKey: ["simulator-records", domain, status, plant, search, page],
        queryFn: () => {
            const params = new URLSearchParams({ domain, page: String(page), page_size: "25" });
            if (status !== "all") params.set("status", status);
            if (plant !== "all") params.set("plant", plant);
            if (search.trim()) params.set("search", search.trim());
            return apiGet<RecordPage>(`/simulator/records?${params.toString()}`);
        },
    });

    const generate = useMutation({
        mutationFn: (c: number) => apiPost<{ created: number; domain_name: string }>("/simulator/generate", { domain, count: c }),
        onSuccess: (res) => {
            toast.success(`SAP mock batch generated — ${res.created} ${res.domain_name} records`);
            void qc.invalidateQueries({ queryKey: ["simulator-domains"] });
            void qc.invalidateQueries({ queryKey: ["simulator-records"] });
            void qc.invalidateQueries({ queryKey: ["dashboard"] });
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Generation failed"),
    });

    const totalPages = useMemo(() => {
        const data = recordsQ.data;
        return data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
    }, [recordsQ.data]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="SAP S/4HANA ERP Simulator"
                description="Generate realistic multi-currency financial documents across 12 domains, 7 plants and the Indian GST regime — then browse them exactly as they would arrive from SAP OData."
            >
                <div className="flex items-end gap-2" data-testid="generate-controls">
                    <div className="w-28">
                        <Label htmlFor="generate-count" className="sr-only">Batch size</Label>
                        <Select value={count} onValueChange={setCount} disabled={!isAdmin}>
                            <SelectTrigger id="generate-count" data-testid="generate-count-select">
                                <SelectValue>{count} records</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {["10", "25", "50", "100", "250", "500"].map((n) => (
                                    <SelectItem key={n} value={n}>{n} records</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button
                        className="bg-[#373757] text-white hover:bg-[#2B2B47]"
                        disabled={!isAdmin || generate.isPending}
                        onClick={() => generate.mutate(Number(count))}
                        data-testid="generate-batch-button"
                    >
                        <Play className="size-3.5" aria-hidden /> {generate.isPending ? "Generating…" : "Generate Mock Batch"}
                    </Button>
                </div>
            </PageHeader>

            {/* domain tabs */}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="SAP domains">
                {(domainsQ.data ?? []).map((dm) => (
                    <button
                        key={dm.key}
                        role="tab"
                        aria-selected={domain === dm.key}
                        onClick={() => { setDomain(dm.key); setPage(1); }}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${domain === dm.key ? "border-[#373757] bg-[#373757] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                            }`}
                        data-testid={`domain-tab-${dm.key}`}
                    >
                        {dm.name}
                        <span className="ml-1.5 font-mono text-[10px] opacity-70">{dm.total}</span>
                    </button>
                ))}
                {domainsQ.isLoading ? <Loading label="Loading domains…" /> : null}
            </div>

            {/* filters */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <Input
                    placeholder="Search doc no or party…"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="md:max-w-xs"
                    data-testid="records-search-input"
                />
                <Select value={status} onValueChange={(v: string) => { setStatus(v); setPage(1); }}>
                    <SelectTrigger className="md:w-40" data-testid="records-status-select">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="synced">Synced</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={plant} onValueChange={(v: string) => { setPlant(v); setPage(1); }}>
                    <SelectTrigger className="md:w-52" data-testid="records-plant-select">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All plants</SelectItem>
                        {PLANTS.map((p) => (
                            <SelectItem key={p.code} value={p.code}>{p.code} — {p.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="ml-auto text-xs text-slate-500" data-testid="records-total-count">
                    {formatNumber(recordsQ.data?.total ?? 0)} records
                </p>
            </div>

            {/* records table */}
            {!recordsQ.data ? (
                recordsQ.isError ? <ErrorState error={recordsQ.error} onRetry={() => void recordsQ.refetch()} /> : <Loading label="Loading records…" />
            ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50 hover:bg-slate-50">
                                <TableHead className="text-xs">SAP Doc No</TableHead>
                                <TableHead className="text-xs">Type</TableHead>
                                <TableHead className="text-xs">Party / Account</TableHead>
                                <TableHead className="text-xs">Plant</TableHead>
                                <TableHead className="text-xs">Currency</TableHead>
                                <TableHead className="text-right text-xs">Amount (orig)</TableHead>
                                <TableHead className="text-right text-xs">₹ INR</TableHead>
                                <TableHead className="text-right text-xs">GST</TableHead>
                                <TableHead className="text-xs">D/C</TableHead>
                                <TableHead className="text-xs">Doc Date</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                                <TableHead className="text-xs" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {recordsQ.data.items.map((r) => (
                                <TableRow key={r.id} data-testid="record-row">
                                    <TableCell className="font-mono text-xs font-medium">{r.sap_doc_no}</TableCell>
                                    <TableCell className="text-xs text-slate-600">{r.record_type}</TableCell>
                                    <TableCell className="max-w-44 truncate text-xs" title={r.party_name ?? undefined}>{r.party_name ?? "—"}</TableCell>
                                    <TableCell className="font-mono text-xs">{r.plant_code}</TableCell>
                                    <TableCell className="font-mono text-xs">{r.currency}</TableCell>
                                    <TableCell className="text-right font-mono text-xs">{r.amount === null ? "—" : r.amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-right font-mono text-xs font-semibold">{formatInr(r.amount_inr)}</TableCell>
                                    <TableCell className="text-right font-mono text-xs">{formatInr((r.cgst ?? 0) + (r.sgst ?? 0) + (r.igst ?? 0))}</TableCell>
                                    <TableCell className="font-mono text-xs">{r.debit_credit}</TableCell>
                                    <TableCell className="text-xs text-slate-600">{r.doc_date ?? "—"}</TableCell>
                                    <TableCell><StatusBadge status={r.status} /></TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="icon-xs" aria-label={`View raw payload for ${r.sap_doc_no}`} onClick={() => setPayloadFor(r)} data-testid={`record-payload-button-${r.sap_doc_no}`}>
                                            <FileJson className="size-3.5" aria-hidden />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {recordsQ.data.items.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={12} className="py-8 text-center text-sm text-slate-500">
                                        No records match the current filters — generate a mock batch to populate this domain.
                                    </TableCell>
                                </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* pagination */}
            <div className="flex items-center justify-between text-sm">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="records-prev-button">
                    Previous
                </Button>
                <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} data-testid="records-next-button">
                    Next
                </Button>
            </div>

            {/* payload dialog */}
            <Dialog open={payloadFor !== null} onOpenChange={(open: boolean) => !open && setPayloadFor(null)}>
                <DialogContent className="max-w-2xl" data-testid="record-payload-dialog">
                    <DialogHeader>
                        <DialogTitle className="font-heading">Raw SAP payload — {payloadFor?.sap_doc_no}</DialogTitle>
                    </DialogHeader>
                    {payloadFor ? <PayloadView id={payloadFor.id} /> : null}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function PayloadView({ id }: { id: string }) {
    const q = useQuery({
        queryKey: ["record-payload", id],
        queryFn: () => apiGet<{ sap_doc_no: string; payload: Record<string, unknown> }>(`/simulator/records/${id}/payload`),
    });
    if (q.isError) return <ErrorState error={q.error} />;
    if (!q.data) return <Loading label="Loading payload…" />;
    return <JsonViewer data={q.data.payload} testid="record-payload-json" />;
}
