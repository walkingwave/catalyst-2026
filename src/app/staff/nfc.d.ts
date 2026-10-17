// Minimal Web NFC typings (Android Chrome). https://w3c.github.io/web-nfc/
interface NDEFReadingEvent extends Event {
  serialNumber: string;
  message: unknown;
}
interface NDEFReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((this: NDEFReader, ev: NDEFReadingEvent) => void) | null;
  onreadingerror: ((this: NDEFReader, ev: Event) => void) | null;
}
declare const NDEFReader: { prototype: NDEFReader; new (): NDEFReader };
interface Window {
  NDEFReader?: typeof NDEFReader;
}
