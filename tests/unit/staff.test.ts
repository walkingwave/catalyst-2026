import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkStaffPin, staffPinFromRequest } from "@/lib/staff";

describe("checkStaffPin", () => {
  const prev = process.env.STAFF_PIN;
  beforeEach(() => {
    process.env.STAFF_PIN = "1234";
  });
  afterEach(() => {
    process.env.STAFF_PIN = prev;
  });
  it("matches", () => expect(checkStaffPin("1234")).toBe(true));
  it("rejects wrong", () => expect(checkStaffPin("0000")).toBe(false));
  it("rejects different length", () => expect(checkStaffPin("12345")).toBe(false));
  it("rejects empty/null", () => {
    expect(checkStaffPin("")).toBe(false);
    expect(checkStaffPin(null)).toBe(false);
  });
  it("fails closed when env unset", () => {
    delete process.env.STAFF_PIN;
    expect(checkStaffPin("1234")).toBe(false);
  });
  it("reads the header", () => {
    expect(staffPinFromRequest(new Request("http://x", { headers: { "x-staff-pin": "9" } }))).toBe("9");
    expect(staffPinFromRequest(new Request("http://x"))).toBeNull();
  });
});
