// Minimal Web NFC typings (Android Chrome). https://w3c.github.io/web-nfc/
interface NDEFReadingEvent extends Event {
  serialNumber: string;
  message: unknown;
}
interface NDEFRecordInit {
  recordType: string;
  data?: string | BufferSource;
  mediaType?: string;
  id?: string;
  lang?: string;
}
interface NDEFMessageInit {
  records: NDEFRecordInit[];
}
interface NDEFReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(message: string | NDEFMessageInit, options?: { overwrite?: boolean; signal?: AbortSignal }): Promise<void>;
  onreading: ((this: NDEFReader, ev: NDEFReadingEvent) => void) | null;
  onreadingerror: ((this: NDEFReader, ev: Event) => void) | null;
}
declare const NDEFReader: { prototype: NDEFReader; new (): NDEFReader };
interface Window {
  NDEFReader?: typeof NDEFReader;
}
