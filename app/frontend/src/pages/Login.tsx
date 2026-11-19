/** Login — split branded screen with one-click demo accounts (JWT httpOnly cookie session). */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Building2, Database, Layers, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEMO_PASSWORD = "meridian2026";

export default function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);

    const login = useMutation({
        mutationFn: (creds: { email: string; password: string }) => apiPost<User>("/auth/login", creds),
        onSuccess: (user) => {
            beginSession();
            toast.success(`Welcome back, ${user.name.split(" (")[0]}`);
            navigate("/", { replace: true });
        },
        onError: (err) => {
            const message = err instanceof Error ? err.message : "Login failed";
            setError(message);
        },
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!email || !password) {
            setError("Enter both email and password");
            return;
        }
        login.mutate({ email, password });
    };

    const demoLogin = (demoEmail: string) => {
        setEmail(demoEmail);
        setPassword(DEMO_PASSWORD);
        setError(null);
        login.mutate({ email: demoEmail, password: DEMO_PASSWORD });
    };

    return (
        <div className="flex min-h-svh bg-white" data-testid="login-page">
            {/* brand panel */}
            <div className="hidden w-[46%] flex-col justify-between bg-[#1E1E38] p-10 text-slate-100 lg:flex">
                <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-md bg-[#373757]">
                        <Building2 className="size-5 text-white" aria-hidden />
                    </div>
                    <div>
                        <p className="font-heading text-base font-bold text-white">Integration Bridge</p>
                        <p className="text-xs text-slate-400">ERP Analytics Connector</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center gap-4 rounded-lg border border-[#2D2D4D] bg-[#282846] p-4">
                        <div className="flex-1 text-center">
                            <p className="font-heading text-sm font-bold text-white">SAP S/4HANA</p>
                            <p className="text-xs text-slate-400">12 OData sources</p>
                        </div>
                        <Layers className="size-5 text-slate-400" aria-hidden />
                        <div className="flex-1 text-center">
                            <p className="font-heading text-sm font-bold text-white">FinSight</p>
                            <p className="text-xs text-slate-400">INR analytics store</p>
                        </div>
                    </div>
                    <ul className="space-y-3 text-sm text-slate-300">
                        <li className="flex items-start gap-2">
                            <Database className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
                            Simulated ERP data across 12 financial domains and 7 Indian plants
                        </li>
                        <li className="flex items-start gap-2">
                            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
                            India data residency (ap-south-1) with an immutable audit trail
                        </li>
                        <li className="flex items-start gap-2">
                            <Layers className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
                            GST-aware transformation, reconciliation and circuit-breaker pipelines
                        </li>
                    </ul>
                </div>

                <p className="text-xs text-slate-500">
                    Simulation environment — no real SAP or FinSight system is contacted. All data is generated locally.
                </p>
            </div>

            {/* form panel */}
            <div className="flex flex-1 items-center justify-center bg-[#F8FAFC] px-6 py-12">
                <div className="w-full max-w-md space-y-6">
                    <div className="lg:hidden">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="flex size-9 items-center justify-center rounded-md bg-[#373757]">
                                <Building2 className="size-5 text-white" aria-hidden />
                            </div>
                            <p className="font-heading text-base font-bold text-slate-900">Integration Bridge</p>
                        </div>
                    </div>

                    <div>
                        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">Sign in</h1>
                        <p className="mt-1 text-sm text-slate-500">Meridian Manufacturing Ltd · Financial integration platform</p>
                    </div>

                    <form onSubmit={submit} className="space-y-4" data-testid="login-form">
                        <div className="space-y-1.5">
                            <Label htmlFor="email">Work email</Label>
                            <Input
                                id="email"
                                type="email"
                                autoComplete="username"
                                placeholder="admin@meridian.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                data-testid="login-email-input"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                data-testid="login-password-input"
                            />
                        </div>

                        {error ? (
                            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="login-error">
                                {error}
                            </p>
                        ) : null}

                        <Button type="submit" className="w-full bg-[#373757] text-white hover:bg-[#2B2B47]" disabled={login.isPending} data-testid="login-submit-button">
                            {login.isPending ? "Signing in…" : "Sign in"}
                        </Button>
                    </form>

                    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Demo accounts</p>
                        <Button
                            variant="outline"
                            className="w-full justify-start"
                            onClick={() => demoLogin("admin@meridian.com")}
                            disabled={login.isPending}
                            data-testid="demo-admin-button"
                        >
                            admin@meridian.com — full access
                        </Button>
                        <Button
                            variant="outline"
                            className="w-full justify-start"
                            onClick={() => demoLogin("viewer@meridian.com")}
                            disabled={login.isPending}
                            data-testid="demo-viewer-button"
                        >
                            viewer@meridian.com — read-only
                        </Button>
                        <p className="pt-1 text-xs text-slate-400">Password for both: {DEMO_PASSWORD}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
