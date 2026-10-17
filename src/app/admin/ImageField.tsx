"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { uploadImage, type H } from "./api";
import { IconX } from "@/components/icons";

/** Image picker: shows the current image, uploads a replacement, or clears it. */
export function ImageField({
  label,
  value,
  folder,
  headers,
  aspect = "aspect-[16/9]",
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  folder: string;
  headers: H;
  aspect?: string;
  onChange: (url: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="label text-ink-2">{label}</span>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="label text-ink-2 flex items-center gap-1">
            <IconX size={12} /> Remove
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className={`relative w-full ${aspect} bg-surface-2 overflow-hidden flex items-center justify-center press`}
      >
        {value ? <Image src={value} alt="" fill className="object-cover" unoptimized /> : <span className="label text-ink-2">{busy ? "Uploading…" : "Tap to upload"}</span>}
        {value && !busy && <span className="absolute bottom-2 right-2 label bg-invert-bg text-invert-fg px-2 py-1">Replace</span>}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          setErr(null);
          try {
            onChange(await uploadImage(f, folder, headers));
          } catch (x) {
            setErr(x instanceof Error ? x.message : "Upload failed");
          }
          setBusy(false);
        }}
      />
      {err && <p className="t-foot text-danger mt-1">{err}</p>}
    </div>
  );
}
