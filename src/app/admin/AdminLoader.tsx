"use client";

import dynamic from "next/dynamic";
import { ConsoleSkeleton } from "@/components/ui";

// Web NFC + localStorage are browser-only.
const AdminConsole = dynamic(() => import("./AdminConsole").then((m) => m.AdminConsole), {
  ssr: false,
  loading: () => <ConsoleSkeleton label="Loading admin" />,
});

export function AdminLoader() {
  return <AdminConsole />;
}
