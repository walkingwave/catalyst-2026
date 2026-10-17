import { timingSafeEqual } from "node:crypto";

export function checkStaffPin(pin: string | null | undefined): boolean {
  const expected = process.env.STAFF_PIN;
  if (!expected || !pin) return false;
  const a = Buffer.from(pin);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function staffPinFromRequest(req: Request): string | null {
  return req.headers.get("x-staff-pin");
}
