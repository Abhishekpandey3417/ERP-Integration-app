import { queryClient } from "@/lib/queryClient";
import { apiPost } from "@/lib/api";

export function beginSession() {
  queryClient.clear();
}

export async function endSession() {
  try {
    await apiPost("/auth/logout");
  } catch {
    // Ignore error on logout
  }
  queryClient.clear();
  window.location.href = "/login";
}

