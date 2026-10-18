"use client";

import dynamic from "next/dynamic";
import { ConsoleSkeleton } from "@/components/ui";

// Web NFC + localStorage are browser-only; skip SSR for the station.
const StaffStation = dynamic(() => import("./StaffStation").then((m) => m.StaffStation), {
  ssr: false,
  loading: () => <ConsoleSkeleton label="Loading station" />,
});

export function StaffLoader() {
  return <StaffStation />;
}
