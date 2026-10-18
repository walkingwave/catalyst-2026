/** Normalize user input to E.164. Defaults to +1 for 10-digit numbers. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (input.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return null;
}

/**
 * Demo and test numbers never receive real texts. Covers the Supabase test OTP range
 * (+1555…) and anything else listed in DEMO_PHONES (comma separated, E.164).
 */
export function isDemoPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  if (/^1?555\d{7}$/.test(digits)) return true;
  const extra = (process.env.DEMO_PHONES ?? "").split(",").map((p) => p.replace(/\D/g, "")).filter(Boolean);
  return extra.includes(digits);
}
