"use client";

/** Thin fetch helpers for the admin console. All take the staff PIN header builder. */
export type H = () => HeadersInit;

export async function call<T = unknown>(url: string, headers: H, init: RequestInit = {}): Promise<{ ok: boolean; message?: string } & T> {
  const r = await fetch(url, { ...init, headers: { ...headers(), ...(init.headers ?? {}) } });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string } & T;
  return { ...j, ok: r.ok && j.ok !== false, message: j.message ?? (r.ok ? undefined : `HTTP ${r.status}`) };
}

export const json = (data: unknown): RequestInit => ({ body: JSON.stringify(data) });

/** Upload an image to the media bucket. Returns the public URL. */
export async function uploadImage(file: File, folder: string, headers: H): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", folder);
  const h = { ...headers() } as Record<string, string>;
  delete h["content-type"]; // let the browser set the multipart boundary
  const r = await fetch("/api/admin/upload", { method: "POST", headers: h, body: fd });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; url?: string; message?: string };
  if (!r.ok || !j.url) throw new Error(j.message ?? "Upload failed");
  return j.url;
}
