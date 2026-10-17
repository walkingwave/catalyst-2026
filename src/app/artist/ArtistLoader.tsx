"use client";

import dynamic from "next/dynamic";

const ArtistConsole = dynamic(() => import("./ArtistConsole").then((m) => m.ArtistConsole), {
  ssr: false,
  loading: () => <p className="t-sub text-ink-2 p-6">Loading console…</p>,
});

export function ArtistLoader() {
  return <ArtistConsole />;
}
