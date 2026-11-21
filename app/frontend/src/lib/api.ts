// src/lib/api.ts
const API_BASE = "/api";

function formatUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/api/")) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

export async function apiGet<T>(url: string): Promise<T> {
  const target = formatUrl(url);
  const resp = await fetch(target, {
    credentials: "include",
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const errJson = await resp.json();
      if (errJson?.detail) detail = errJson.detail;
    } catch {}
    throw new Error(detail || `GET ${target} failed`);
  }
  return (await resp.json()) as T;
}

export async function apiPost<T>(url: string, body?: any): Promise<T> {
  const target = formatUrl(url);
  const resp = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const errJson = await resp.json();
      if (errJson?.detail) detail = errJson.detail;
    } catch {}
    throw new Error(detail || `POST ${target} failed`);
  }
  return (await resp.json()) as T;
}

export async function apiPut<T>(url: string, body?: any): Promise<T> {
  const target = formatUrl(url);
  const resp = await fetch(target, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const errJson = await resp.json();
      if (errJson?.detail) detail = errJson.detail;
    } catch {}
    throw new Error(detail || `PUT ${target} failed`);
  }
  return (await resp.json()) as T;
}
