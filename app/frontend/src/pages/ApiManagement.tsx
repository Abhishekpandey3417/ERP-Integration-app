/** Module 3 — API Management: 24-endpoint registry, live testing, outage simulation. */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowDownRight, ArrowUpRight, Power } from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiPost } from "@/lib/api";
import type { ApiEndpoint, EndpointTest } from "@/lib/types";
import { useAuth } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, JsonViewer, Loading, PageHeader, StatusBadge } from "@/components/shared";
import { formatDateTime, formatNumber, formatTimeAgo } from "@/lib/format";

function MethodBadge({ method }: { method: string }) {
    const cls = method === "GET" ? "bg-sky-50 text-sky-800 border-sky-200" : "bg-violet-50 text-violet-800 border-violet-200";
    return <span className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[11px] font-bold ${cls}`}>{method}</span>;
}

export default function ApiManagement() {
    const user = useAuth();
    const isAdmin = user.role === "admin";
    const qc = useQueryClient();
    const [openId, setOpenId] = useState<string | null>(null);

    const endpointsQ = useQuery({ queryKey: ["endpoints"], queryFn: () => apiGet<ApiEndpoint[]>("/api-mgmt/endpoints") });
    const testsQ = useQuery({ queryKey: ["api-tests"], queryFn: () => apiGet<EndpointTest[]>("/api-mgmt/tests?limit=25") });

    const test = useMutation({
        mutationFn: (id: string) => apiPost<EndpointTest>(`/api-mgmt/endpoints/${id}/test`),
        onSuccess: (t) => {
            toast.success(`${t.endpoint_key} → ${t.status_code} in ${t.latency_ms} ms`);
            void qc.invalidateQueries({ queryKey: ["endpoints"] });
            void qc.invalidateQueries({ queryKey: ["api-tests"] });
            void qc.invalidateQueries({ queryKey: ["dashboard"] });
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Test failed"),
    });

    const toggle = useMutation({
        mutationFn: ({ id, status }: { id: string; status: "up" | "down" }) =>
            apiPost<ApiEndpoint>(`/api-mgmt/endpoints/${id}/health`, { status }),
        onSuccess: (ep) => {
            toast.success(`${ep.key} marked ${ep.status.toUpperCase()}`);
            void qc.invalidateQueries({ queryKey: ["endpoints"] });
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Toggle failed"),
    });

    const all = endpointsQ.data ?? [];
    const sources = all.filter((e) => e.side === "source");
    const destinations = all.filter((e) => e.side === "destination");
    const open = all.find((e) => e.id === openId) ?? null;

    return (
        <div className="space-y-6">
            <PageHeader
                title="API Gateway & Endpoint Registry"
                description="The 24 simulated integration endpoints — 12 SAP S/4HANA OData sources and 12 FinSight REST ingestion destinations — with live testing and authentication documentation."
            />

            {!endpointsQ.data ? (
                endpointsQ.isError ? <ErrorState error={endpointsQ.error} onRetry={() => void endpointsQ.refetch()} /> : <Loading label="Loading endpoints…" />
            ) : (
                <>
                    <EndpointSection
                        title="SAP S/4HANA source endpoints"
                        subtitle="OAuth2 bearer-protected OData extracts (simulated) — toggle an endpoint DOWN to rehearse outage handling"
                        endpoints={sources}
                        onOpen={setOpenId}
                        onTest={(id) => test.mutate(id)}
                        onToggle={(id, status) => toggle.mutate({ id, status })}
                        isAdmin={isAdmin}
                        testing={test.isPending}
                    />
                    <EndpointSection
                        title="FinSight destination endpoints"
                        subtitle="API-key + HMAC ingestion into the INR analytics store (simulated)"
                        endpoints={destinations}
                        onOpen={setOpenId}
                        onTest={(id) => test.mutate(id)}
                        onToggle={(id, status) => toggle.mutate({ id, status })}
                        isAdmin={isAdmin}
                        testing={test.isPending}
                    />

                    {/* recent tests */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="font-heading text-base">Recent API tests</CardTitle>
                            <CardDescription>Every test records status, latency and outcome for monitoring</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!testsQ.data ? (
                                <Loading label="Loading tests…" />
                            ) : testsQ.data.length === 0 ? (
                                <p className="py-6 text-center text-sm text-slate-500">No tests yet — open an endpoint and press “Run test”.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table data-testid="api-tests-table">
                                        <TableHeader>
                                            <TableRow className="bg-slate-50 hover:bg-slate-50">
                                                <TableHead className="text-xs">When</TableHead>
                                                <TableHead className="text-xs">Endpoint</TableHead>
                                                <TableHead className="text-xs">Method</TableHead>
                                                <TableHead className="text-right text-xs">Status</TableHead>
                                                <TableHead className="text-right text-xs">Latency</TableHead>
                                                <TableHead className="text-xs">Outcome</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {testsQ.data.map((t) => (
                                                <TableRow key={t.id}>
                                                    <TableCell className="text-xs text-slate-500">{formatTimeAgo(t.created_at)}</TableCell>
                                                    <TableCell className="font-mono text-xs">{t.endpoint_key}</TableCell>
                                                    <TableCell><MethodBadge method={t.method} /></TableCell>
                                                    <TableCell className="text-right font-mono text-xs">{t.status_code}</TableCell>
                                                    <TableCell className="text-right font-mono text-xs">{t.latency_ms} ms</TableCell>
                                                    <TableCell><StatusBadge status={t.success ? "success" : "failed"} /></TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}

            {/* detail dialog */}
            <Dialog open={open !== null} onOpenChange={(o: boolean) => !o && setOpenId(null)}>
                <DialogContent className="max-w-3xl" data-testid="endpoint-detail-dialog">
                    {open ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 font-heading">
                                    {open.name} <StatusBadge status={open.status} />
                                </DialogTitle>
                                <DialogDescription>{open.description}</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                                    <MethodBadge method={open.method} />
                                    <span className="font-mono text-xs text-slate-600">{open.base_url}{open.path}</span>
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                                    <div className="rounded-md border border-slate-200 p-3">
                                        <p className="font-semibold uppercase tracking-wider text-slate-500">Auth</p>
                                        <p className="mt-1 text-slate-700">{open.auth_type}</p>
                                    </div>
                                    <div className="rounded-md border border-slate-200 p-3">
                                        <p className="font-semibold uppercase tracking-wider text-slate-500">Tests</p>
                                        <p className="mt-1 font-mono text-slate-700">{formatNumber(open.test_count)} · {open.avg_latency_ms !== null ? `${Math.round(open.avg_latency_ms)} ms avg` : "no data"}</p>
                                    </div>
                                    <div className="rounded-md border border-slate-200 p-3">
                                        <p className="font-semibold uppercase tracking-wider text-slate-500">Last test</p>
                                        <p className="mt-1 text-slate-700">{open.last_test_at ? `${open.last_test_success ? "Passed" : "Failed"} · ${formatTimeAgo(open.last_test_at)}` : "never tested"}</p>
                                    </div>
                                </div>

                                <div className="rounded-md border border-slate-200 p-3 text-xs leading-5 text-slate-600" data-testid="endpoint-auth-doc">
                                    <p className="font-semibold text-slate-800">Authentication documentation</p>
                                    <p className="mt-1">{open.auth_doc}</p>
                                </div>

                                <Tabs defaultValue="request">
                                    <TabsList>
                                        <TabsTrigger value="request">Request</TabsTrigger>
                                        <TabsTrigger value="response">Response</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="request"><JsonViewer data={open.request_sample} testid="endpoint-request-json" /></TabsContent>
                                    <TabsContent value="response"><JsonViewer data={open.response_sample} testid="endpoint-response-json" /></TabsContent>
                                </Tabs>

                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        className="bg-[#373757] text-white hover:bg-[#2B2B47]"
                                        disabled={!isAdmin || test.isPending}
                                        onClick={() => test.mutate(open.id)}
                                        data-testid="endpoint-test-button"
                                    >
                                        <Activity className="size-3.5" aria-hidden /> {test.isPending ? "Testing…" : "Run live test"}
                                    </Button>
                                    {open.side === "source" ? (
                                        open.status === "up" ? (
                                            <Button variant="outline" disabled={!isAdmin || toggle.isPending} onClick={() => toggle.mutate({ id: open.id, status: "down" })} data-testid="endpoint-outage-toggle">
                                                <Power className="size-3.5" aria-hidden /> Simulate outage
                                            </Button>
                                        ) : (
                                            <Button variant="outline" disabled={!isAdmin || toggle.isPending} onClick={() => toggle.mutate({ id: open.id, status: "up" })} data-testid="endpoint-outage-toggle">
                                                <Power className="size-3.5" aria-hidden /> Restore endpoint
                                            </Button>
                                        )
                                    ) : null}
                                    {!isAdmin ? <p className="text-xs text-slate-400">Viewer role — testing and outage simulation are admin-only</p> : null}
                                </div>
                            </div>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function EndpointSection({
    title,
    subtitle,
    endpoints,
    onOpen,
    onTest,
    onToggle,
    isAdmin,
    testing,
}: {
    title: string;
    subtitle: string;
    endpoints: ApiEndpoint[];
    onOpen: (id: string) => void;
    onTest: (id: string) => void;
    onToggle: (id: string, status: "up" | "down") => void;
    isAdmin: boolean;
    testing: boolean;
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-heading text-base">{title}</CardTitle>
                <CardDescription>{subtitle}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {endpoints.map((ep) => (
                        <div key={ep.id} className="rounded-lg border border-slate-200 p-3 transition-colors duration-150 hover:border-slate-300" data-testid={`endpoint-card-${ep.key}`}>
                            <div className="flex items-center justify-between gap-2">
                                <p className="font-mono text-xs font-semibold text-slate-800">{ep.key}</p>
                                <StatusBadge status={ep.status} />
                            </div>
                            <p className="mt-1 truncate text-xs text-slate-500" title={ep.name}>{ep.name}</p>
                            <div className="mt-2 flex items-center gap-1.5">
                                <MethodBadge method={ep.method} />
                                <span className="truncate font-mono text-[11px] text-slate-400">{ep.path}</span>
                            </div>
                            <p className="mt-2 font-mono text-[11px] text-slate-500">
                                {formatNumber(ep.test_count)} tests · {ep.avg_latency_ms !== null ? `${Math.round(ep.avg_latency_ms)} ms avg` : "—"}
                            </p>
                            <div className="mt-3 flex gap-1.5">
                                <Button size="xs" variant="outline" onClick={() => onOpen(ep.id)} data-testid={`endpoint-open-${ep.key}`}>
                                    Inspect
                                </Button>
                                <Button size="xs" variant="secondary" disabled={!isAdmin || testing} onClick={() => onTest(ep.id)} data-testid={`endpoint-quick-test-${ep.key}`}>
                                    Test
                                </Button>
                                {ep.side === "source" ? (
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        disabled={!isAdmin}
                                        onClick={() => onToggle(ep.id, ep.status === "up" ? "down" : "up")}
                                        aria-label={ep.status === "up" ? "Simulate outage" : "Restore endpoint"}
                                        data-testid={`endpoint-toggle-${ep.key}`}
                                    >
                                        {ep.status === "up" ? <ArrowDownRight className="size-3.5" aria-hidden /> : <ArrowUpRight className="size-3.5" aria-hidden />}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
