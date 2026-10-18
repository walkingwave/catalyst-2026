import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("defaults 10 digits to +1", () => expect(normalizePhone("5550100099")).toBe("+15550100099"));
  it("accepts formatting", () => expect(normalizePhone("(555) 010-0099")).toBe("+15550100099"));
  it("keeps leading 1", () => expect(normalizePhone("15550100099")).toBe("+15550100099"));
  it("keeps explicit +", () => expect(normalizePhone("+44 7700 900123")).toBe("+447700900123"));
  it("rejects short", () => expect(normalizePhone("12345")).toBeNull());
  it("rejects empty", () => expect(normalizePhone("   ")).toBeNull());
});

import { isDemoPhone } from "@/lib/phone";

describe("isDemoPhone", () => {
  it("treats Supabase test OTP numbers as demo", () => {
    expect(isDemoPhone("+15550100099")).toBe(true);
    expect(isDemoPhone("5550100001")).toBe(true);
  });
  it("keeps real numbers", () => {
    expect(isDemoPhone("+14165551234")).toBe(false);
    expect(isDemoPhone(null)).toBe(false);
  });
  it("honours DEMO_PHONES", () => {
    process.env.DEMO_PHONES = "+1 416 000 0000";
    expect(isDemoPhone("+14160000000")).toBe(true);
    delete process.env.DEMO_PHONES;
  });
});
