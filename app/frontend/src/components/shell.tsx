/** App shell — fixed dark sidebar, sticky topbar, and the auth gate for all module routes. */

import { createContext, useContext, useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
    Building2,
    Database,
    Gauge,
    GitCompareArrows,
    LayoutDashboard,
    LogOut,
    Menu,
    PlugZap,
    RefreshCcw,
    ShieldAlert,
    Shuffle,
    TrendingUp,
    X,
} from "lucide-react";

import { apiGet } from "@/lib/api";
import { endSession } from "@/lib/session";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

const AuthContext = createContext<{ user: User } | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): User & { user: User } {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside the authenticated shell");
    const u = ctx.user;
    return Object.assign(u, { user: u });
}

interface NavItem {
    to: string;
    label: string;
    icon: typeof LayoutDashboard;
    testid: string;
    end?: boolean;
}

const NAV: readonly NavItem[] = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard", end: true },
    { to: "/simulator", label: "SAP ERP Simulator", icon: Database, testid: "nav-sap-simulator" },
    { to: "/api-management", label: "API Management", icon: PlugZap, testid: "nav-api-management" },
    { to: "/transformation", label: "Data Transformation", icon: Shuffle, testid: "nav-transformation" },
    { to: "/synchronization", label: "Data Synchronization", icon: RefreshCcw, testid: "nav-synchronization" },
    { to: "/reconciliation", label: "Reconciliation", icon: GitCompareArrows, testid: "nav-reconciliation" },
    { to: "/error-management", label: "Error Management", icon: ShieldAlert, testid: "nav-error-management" },
    { to: "/monitoring", label: "Monitoring", icon: Gauge, testid: "nav-monitoring" },
    { to: "/analytics", label: "Financial Analytics", icon: TrendingUp, testid: "nav-analytics" },
];

export function RequireAuth() {
    const q = useQuery({
        queryKey: ["session"],
        queryFn: () => apiGet<User>("/auth/me"),
        retry: false,
        staleTime: 60_000,
    });

    if (q.isPending) {
        return (
            <div className="flex min-h-svh items-center justify-center bg-[#F8FAFC] text-sm text-slate-500">
                Loading Integration Bridge…
            </div>
        );
    }
    if (q.isError || !q.data) return <Navigate to="/login" replace />;
    return (
        <AuthContext.Provider value={{ user: q.data }}>
            <AppShell />
        </AuthContext.Provider>
    );
}

function useIstClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(id);
    }, []);
    return now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
}

function AppShell() {
    const { user } = useContext(AuthContext)!;
    const location = useLocation();
    const [navOpen, setNavOpen] = useState(false);
    const istTime = useIstClock();
    const current = NAV.find((n) => (n.end ? location.pathname === "/" : location.pathname.startsWith(n.to)));

    return (
        <div className="flex h-screen overflow-hidden bg-[#F8FAFC] font-sans text-slate-900">
            {/* mobile overlay */}
            {navOpen ? (
                <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden />
            ) : null}

            {/* sidebar */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#2D2D4D] bg-[#1E1E38] text-slate-100 transition-transform duration-200 lg:static lg:translate-x-0",
                    navOpen ? "translate-x-0" : "-translate-x-full",
                )}
                data-testid="sidebar"
            >
                <div className="flex items-start gap-3 border-b border-[#2D2D4D] px-5 py-5">
                    <div className="flex size-9 items-center justify-center rounded-md bg-[#373757]">
                        <Building2 className="size-5 text-white" aria-hidden />
                    </div>
                    <div className="min-w-0">
                        <p className="font-heading text-sm font-bold leading-tight text-white">Integration Bridge</p>
                        <p className="truncate text-xs text-slate-400">Meridian Manufacturing Ltd</p>
                    </div>
                    <button
                        type="button"
                        className="ml-auto rounded p-1 text-slate-400 hover:bg-[#282846] lg:hidden"
                        onClick={() => setNavOpen(false)}
                        aria-label="Close navigation"
                        data-testid="sidebar-close-button"
                    >
                        <X className="size-4" aria-hidden />
                    </button>
                </div>

                <div className="border-b border-[#2D2D4D] px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                        <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
                        S/4HANA · SIMULATED
                    </span>
                </div>

                <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Module navigation">
                    {NAV.map(({ to, label, icon: Icon, testid, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            onClick={() => setNavOpen(false)}
                            className={({ isActive }: { isActive: boolean }) =>
                                cn(
                                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150",
                                    isActive
                                        ? "bg-[#373757] font-semibold text-white"
                                        : "text-slate-300 hover:bg-[#282846] hover:text-white",
                                )
                            }
                            data-testid={testid}
                        >
                            <Icon className="size-4 shrink-0" aria-hidden />
                            {label}
                        </NavLink>
                    ))}
                </nav>

                <div className="border-t border-[#2D2D4D] px-5 py-4">
                    <p className="truncate text-sm font-medium text-white">{user.name}</p>
                    <p className="truncate text-xs text-slate-400">{user.email}</p>
                    <div className="mt-2 flex items-center justify-between">
                        <span className="rounded-full border border-[#4E4E7B] bg-[#4E4E7B]/40 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-200">
                            {user.role}
                        </span>
                        <button
                            type="button"
                            onClick={() => void endSession()}
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-300 transition-colors duration-150 hover:bg-[#282846] hover:text-white"
                            data-testid="logout-button"
                        >
                            <LogOut className="size-3.5" aria-hidden /> Sign out
                        </button>
                    </div>
                </div>
            </aside>

            {/* main */}
            <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-xs md:px-6">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
                            onClick={() => setNavOpen(true)}
                            aria-label="Open navigation"
                            data-testid="sidebar-open-button"
                        >
                            <Menu className="size-4" aria-hidden />
                        </button>
                        <div>
                            <p className="font-heading text-sm font-bold text-slate-900">{current?.label ?? "Dashboard"}</p>
                            <p className="text-xs text-slate-500">Meridian Manufacturing Ltd · Company 1000</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="hidden text-xs text-slate-500 sm:inline">{istTime} IST</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                            ap-south-1 · India residency
                        </span>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto">
                    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
