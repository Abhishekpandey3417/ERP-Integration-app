import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/queryClient";

import { RequireAuth } from "@/components/shell";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Simulator from "@/pages/Simulator";
import ApiManagement from "@/pages/ApiManagement";
import DataTransformation from "@/pages/DataTransformation";
import DataSynchronization from "@/pages/DataSynchronization";
import Reconciliation from "@/pages/Reconciliation";
import ErrorManagement from "@/pages/ErrorManagement";
import Monitoring from "@/pages/Monitoring";
import FinancialAnalytics from "@/pages/FinancialAnalytics";

function PlaceholderModule({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
      <h2 className="font-heading text-xl font-bold text-slate-800">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">
        This module is currently in development.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth />}>
            <Route index element={<Dashboard />} />
            <Route path="simulator" element={<Simulator />} />
            <Route path="api-management" element={<ApiManagement />} />
            <Route path="transformation" element={<DataTransformation />} />
            <Route path="synchronization" element={<DataSynchronization />} />
            <Route path="reconciliation" element={<Reconciliation />} />
            <Route path="error-management" element={<ErrorManagement />} />
            <Route path="monitoring" element={<Monitoring />} />
            <Route path="analytics" element={<FinancialAnalytics />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
