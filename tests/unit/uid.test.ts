import { describe, it, expect } from "vitest";
import { normalizeUid, isValidUid } from "@/lib/uid";

describe("normalizeUid", () => {
  it("strips colons and uppercases", () => expect(normalizeUid("04:a1:b2:c3:d4:e5:06")).toBe("04A1B2C3D4E506"));
  it("strips spaces and dashes", () => expect(normalizeUid(" 04-a1 b2 ")).toBe("04A1B2"));
  it("empty stays empty", () => expect(normalizeUid("")).toBe(""));
});

describe("isValidUid", () => {
  it("accepts 7-byte NTAG serials", () => expect(isValidUid("04A1B2C3D4E506")).toBe(true));
  it("rejects too short", () => expect(isValidUid("04A1")).toBe(false));
  it("rejects lowercase (must normalize first)", () => expect(isValidUid("04a1b2c3d4e506")).toBe(false));
  it("rejects too long", () => expect(isValidUid("A".repeat(33))).toBe(false));
});
