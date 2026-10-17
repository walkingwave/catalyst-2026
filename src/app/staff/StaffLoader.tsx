"use client";

import dynamic from "next/dynamic";

// Web NFC + localStorage are browser-only; skip SSR for the station.
const StaffStation = dynamic(() => import("./StaffStation").then((m) => m.StaffStation), {
  ssr: false,
  loading: () => <p className="t-subhead text-text-2 p-6">Loading station…</p>,
});

export function StaffLoader() {
  return <StaffStation />;
}
