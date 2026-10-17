"use client";

import dynamic from "next/dynamic";

// Web NFC + localStorage are browser-only.
const AdminConsole = dynamic(() => import("./AdminConsole").then((m) => m.AdminConsole), {
  ssr: false,
  loading: () => <p className="t-sub text-ink-2 p-6">Loading admin…</p>,
});

export function AdminLoader() {
  return <AdminConsole />;
}
