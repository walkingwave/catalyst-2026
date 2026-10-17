/**
 * Supabase Management API (https://api.supabase.com). Needs SUPABASE_ACCESS_TOKEN,
 * a personal access token from supabase.com/dashboard/account/tokens. Server only.
 */
const BASE = "https://api.supabase.com/v1";

function projectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!m) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a supabase.co URL");
  return m[1];
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is not set");
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Supabase management ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

export type TestOtp = { phone: string; code: string };

/** Parse "15550100099=123456,15550100001=123456" into rows. */
export function parseTestOtps(raw: string | null | undefined): TestOtp[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [phone, code] = pair.split("=");
      return { phone: (phone ?? "").replace(/^\+/, ""), code: (code ?? "").trim() };
    })
    .filter((t) => t.phone && t.code);
}

export async function getTestOtps(): Promise<{ otps: TestOtp[]; valid_until: string | null; phone_enabled: boolean }> {
  const cfg = await call<{ sms_test_otp?: string; sms_test_otp_valid_until?: string; external_phone_enabled?: boolean }>(
    `/projects/${projectRef()}/config/auth`,
  );
  return { otps: parseTestOtps(cfg.sms_test_otp), valid_until: cfg.sms_test_otp_valid_until ?? null, phone_enabled: !!cfg.external_phone_enabled };
}

export async function setTestOtps(otps: TestOtp[]): Promise<void> {
  const until = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString(); // 90 days
  await call(`/projects/${projectRef()}/config/auth`, {
    method: "PATCH",
    body: JSON.stringify({
      external_phone_enabled: true,
      sms_test_otp: otps.map((t) => `${t.phone}=${t.code}`).join(","),
      sms_test_otp_valid_until: until,
    }),
  });
}
