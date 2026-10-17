/** Band UIDs: uppercase hex, no separators. "04:a1:b2" and "04a1b2" both -> "04A1B2". */
export function normalizeUid(input: string): string {
  return input.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
}

export function isValidUid(uid: string): boolean {
  return /^[0-9A-Z]{6,32}$/.test(uid);
}
