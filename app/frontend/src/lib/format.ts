/** Indian-locale formatters — INR consolidation, DD/MM/YYYY dates, IST timestamps. */

const IST = "Asia/Kolkata";

/** Compact rupees with Indian units: ₹ 1.24 Cr / ₹ 8.52 L / ₹ 45,120 */
export function formatInrCompact(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1e7) return `${sign}₹ ${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}₹ ${(abs / 1e5).toFixed(2)} L`;
    return `${sign}₹ ${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Full rupees with Indian digit grouping: ₹ 37,65,326.59 */
export function formatInr(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    return `${sign}₹ ${abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return value.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPct(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return `${value.toFixed(1)}%`;
}

/** ISO date (or datetime) → DD/MM/YYYY */
export function formatDate(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: IST });
}

/** ISO datetime → DD/MM/YYYY HH:mm (IST) */
export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: IST })} ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST })} IST`;
}

/** "2026-01" → "Jan 26" for chart axes */
export function formatMonthLabel(month: string): string {
    const [y, m] = month.split("-").map((p) => Number.parseInt(p, 10));
    if (!y || !m) return month;
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${names[m - 1]} ${String(y).slice(2)}`;
}

export function formatTimeAgo(iso: string | null | undefined): string {
    if (!iso) return "—";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "—";
    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
