/**
 * Web NFC helpers (Android Chrome 89+, HTTPS or localhost).
 * Wraps NDEFReader with friendly errors and a screen wake lock while a session is active.
 */
export const nfcSupported = () => typeof window !== "undefined" && "NDEFReader" in window && window.isSecureContext;

export function nfcErrorMessage(err: unknown): string {
  const e = err as { name?: string; message?: string };
  switch (e?.name) {
    case "NotAllowedError":
      return "NFC permission denied. Tap the lock icon in the address bar, allow NFC, then try again.";
    case "NotSupportedError":
      return "NFC is off or unsupported. Turn on NFC in Android settings (Connections → NFC) and reload.";
    case "NotReadableError":
      return "Couldn't read that tag. Hold it still against the top-back of the phone.";
    case "NetworkError":
      return "Tag moved away before the write finished. Hold it still and try again.";
    case "AbortError":
      return "Scan stopped.";
    case "InvalidStateError":
      return "A scan is already running.";
    default:
      return e?.message || "NFC failed to start.";
  }
}

export type NfcSession = { stop: () => void };

/**
 * Start a continuous scan. `onTag` gets the normalized serial and the reader (for writes).
 * Keeps the screen awake until stopped.
 */
export async function startNfc(opts: {
  onTag: (serial: string, reader: NDEFReader, records: { recordType: string; data: string | null }[]) => void;
  onError: (message: string) => void;
}): Promise<NfcSession> {
  if (!nfcSupported()) throw Object.assign(new Error("Web NFC needs Android Chrome over HTTPS."), { name: "NotSupportedError" });
  const ctrl = new AbortController();
  const reader = new window.NDEFReader!();
  let wake: { release: () => Promise<void> } | null = null;

  reader.onreading = (ev) => {
    const records: { recordType: string; data: string | null }[] = [];
    try {
      const msg = ev.message as { records?: { recordType: string; data?: DataView }[] } | undefined;
      for (const r of msg?.records ?? []) {
        let data: string | null = null;
        try {
          if (r.data) data = new TextDecoder().decode(r.data);
        } catch {}
        records.push({ recordType: r.recordType, data });
      }
    } catch {}
    opts.onTag(ev.serialNumber ?? "", reader, records);
  };
  reader.onreadingerror = () => opts.onError("Couldn't read that tag. Hold it still against the top-back of the phone.");

  await reader.scan({ signal: ctrl.signal });
  try {
    wake = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
  } catch {}

  return {
    stop: () => {
      ctrl.abort();
      void wake?.release();
    },
  };
}

/** Write a URL record. Call from inside onTag while the tag is still in the field. */
export async function writeUrl(reader: NDEFReader, url: string): Promise<void> {
  await reader.write({ records: [{ recordType: "url", data: url }] }, { overwrite: true });
}
