import { describe, expect, it } from "vitest";
import { activityOpen, preEventClosesAt } from "@/lib/pre-event";

describe("pre-event window", () => {
  it("locks at doors in Toronto time", () => {
    expect(preEventClosesAt({ date: "2026-10-17", doors_at: "6:30 PM" }).toISOString()).toBe("2026-10-17T22:30:00.000Z");
    expect(preEventClosesAt({ date: "2026-12-05", doors_at: "7pm" }).toISOString()).toBe("2026-12-06T00:00:00.000Z");
    expect(preEventClosesAt({ date: "2026-10-17", doors_at: "19:00" }).toISOString()).toBe("2026-10-17T23:00:00.000Z");
  });
  it("falls back to the start of the show day without a parseable doors time", () => {
    expect(preEventClosesAt({ date: "2026-10-17", doors_at: null }).toISOString()).toBe("2026-10-17T04:00:00.000Z");
    expect(preEventClosesAt({ date: "2026-10-17", doors_at: "TBA" }).toISOString()).toBe("2026-10-17T04:00:00.000Z");
  });
  it("only pre-event activities close", () => {
    const show = { date: "2026-10-17", doors_at: "6:30 PM" };
    const before = Date.parse("2026-10-17T22:29:00Z"), after = Date.parse("2026-10-17T22:31:00Z");
    expect(activityOpen({ pre_event: true }, show, before)).toBe(true);
    expect(activityOpen({ pre_event: true }, show, after)).toBe(false);
    expect(activityOpen({ pre_event: false }, show, after)).toBe(true);
  });
});
