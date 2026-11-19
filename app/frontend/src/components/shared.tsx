/** Shared presentational components reused across all nine modules. */

import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, Inbox, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- page scaffolding

export function PageHeader({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children?: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
                <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
                {description ? <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p> : null}
            </div>
            {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
        </div>
    );
}

// ---------------------------------------------------------------- states

export function Loading({ label = "Loading…" }: { label?: string }) {
    return (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" data-testid="loading-state">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {label}
        </div>
    );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    return (
        <div
            className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            data-testid="error-state"
        >
            <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4" aria-hidden /> Could not load data
            </div>
            <p className="text-red-700">{message}</p>
            {onRetry ? (
                <Button size="sm" variant="outline" onClick={onRetry} data-testid="error-retry-button">
                    <RefreshCcw className="size-3.5" aria-hidden /> Retry
                </Button>
            ) : null}
        </div>
    );
}

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
    return (
        <div
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white/50 px-6 py-10 text-center"
            data-testid="empty-state"
        >
            <Inbox className="size-6 text-slate-400" aria-hidden />
            <p className="text-sm font-medium text-slate-700">{title}</p>
            {hint ? <p className="max-w-md text-xs text-slate-500">{hint}</p> : null}
            {children}
        </div>
    );
}

// ---------------------------------------------------------------- KPI card

export function KpiCard({
    label,
    value,
    sub,
    tone = "default",
    testid,
}: {
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    tone?: "default" | "success" | "warning" | "danger" | "info";
    testid?: string;
}) {
    const toneClasses: Record<string, string> = {
        default: "text-[#1E1E38]",
        success: "text-emerald-700",
        warning: "text-amber-700",
        danger: "text-red-700",
        info: "text-blue-700",
    };
    return (
        <div
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs transition-colors duration-150 hover:border-slate-300"
            data-testid={testid}
        >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className={cn("mt-2 font-mono text-2xl font-bold tracking-tight", toneClasses[tone])}>{value}</p>
            {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
        </div>
    );
}

// ---------------------------------------------------------------- status badge

const BADGE_STYLES: Record<string, string> = {
    synced: "bg-emerald-50 text-emerald-800 border-emerald-200",
    success: "bg-emerald-50 text-emerald-800 border-emerald-200",
    reconciled: "bg-emerald-50 text-emerald-800 border-emerald-200",
    resolved: "bg-emerald-50 text-emerald-800 border-emerald-200",
    up: "bg-emerald-50 text-emerald-800 border-emerald-200",
    closed: "bg-emerald-50 text-emerald-800 border-emerald-200",
    ok: "bg-emerald-50 text-emerald-800 border-emerald-200",
    pending: "bg-amber-50 text-amber-800 border-amber-200",
    backoff: "bg-amber-50 text-amber-800 border-amber-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    half_open: "bg-amber-50 text-amber-800 border-amber-200",
    partial: "bg-amber-50 text-amber-800 border-amber-200",
    failed: "bg-red-50 text-red-800 border-red-200",
    crit: "bg-red-50 text-red-800 border-red-200",
    open: "bg-red-50 text-red-800 border-red-200",
    down: "bg-red-50 text-red-800 border-red-200",
    exceptions_found: "bg-red-50 text-red-800 border-red-200",
    dead_letter: "bg-slate-100 text-slate-700 border-slate-300",
};

export function StatusBadge({ status, testid }: { status: string; testid?: string }) {
    const cls = BADGE_STYLES[status] ?? "bg-slate-100 text-slate-700 border-slate-200";
    return (
        <span
            className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", cls)}
            data-testid={testid ?? `status-badge-${status}`}
        >
            {status.replace(/_/g, " ")}
        </span>
    );
}

// ---------------------------------------------------------------- JSON viewer

function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
    const pad = { paddingLeft: depth * 12 };
    if (typeof value === "string") return <span className="text-emerald-300">"{value}"</span>;
    if (typeof value === "number" || typeof value === "bigint") return <span className="text-amber-300">{String(value)}</span>;
    if (typeof value === "boolean") return <span className="text-pink-300">{String(value)}</span>;
    if (value === null || value === undefined) return <span className="text-slate-500">null</span>;
    if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-slate-400">[]</span>;
        return (
            <span>
                <span className="text-slate-400">[</span>
                {value.map((item, i) => (
                    <span key={i} style={pad} className="block">
                        <JsonNode value={item} depth={depth + 1} />
                        {i < value.length - 1 ? <span className="text-slate-500">,</span> : null}
                    </span>
                ))}
                <span className="text-slate-400">]</span>
            </span>
        );
    }
    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) return <span className="text-slate-400">{"{}"}</span>;
        return (
            <span>
                <span className="text-slate-400">{"{"}</span>
                {entries.map(([key, item], i) => (
                    <span key={key} style={pad} className="block">
                        <span className="text-sky-300">"{key}"</span>
                        <span className="text-slate-400">: </span>
                        <JsonNode value={item} depth={depth + 1} />
                        {i < entries.length - 1 ? <span className="text-slate-500">,</span> : null}
                    </span>
                ))}
                <span className="text-slate-400">{"}"}</span>
            </span>
        );
    }
    return <span>{String(value)}</span>;
}

export function JsonViewer({ data, testid }: { data: unknown; testid?: string }) {
    const [copied, setCopied] = useState(false);
    const text = JSON.stringify(data, null, 2);
    return (
        <div className="relative overflow-auto rounded-lg bg-[#0F172A] p-4" data-testid={testid}>
            <button
                type="button"
                aria-label="Copy JSON"
                className="absolute right-2 top-2 rounded border border-slate-600 bg-slate-800 p-1.5 text-slate-300 transition-colors duration-150 hover:bg-slate-700"
                onClick={() => {
                    navigator.clipboard.writeText(text).then(() => {
                        setCopied(true);
                        toast.success("JSON copied to clipboard");
                        setTimeout(() => setCopied(false), 1500);
                    });
                }}
                data-testid={testid ? `${testid}-copy` : "json-copy-button"}
            >
                {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            </button>
            <pre className="font-mono text-xs leading-5 text-slate-200">
                <JsonNode value={data} />
            </pre>
        </div>
    );
}

// ---------------------------------------------------------------- misc

export function Mono({ children }: { children: ReactNode }) {
    return <span className="font-mono text-xs">{children}</span>;
}

export function Dot({ tone }: { tone: "ok" | "warn" | "bad" }) {
    const cls = tone === "ok" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-red-500";
    return <span className={cn("inline-block size-2 rounded-full", cls)} aria-hidden />;
}
