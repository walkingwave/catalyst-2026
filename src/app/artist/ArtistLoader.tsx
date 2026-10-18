"use client";

import dynamic from "next/dynamic";
import { ConsoleSkeleton } from "@/components/ui";

const ArtistConsole = dynamic(() => import("./ArtistConsole").then((m) => m.ArtistConsole), {
  ssr: false,
  loading: () => <ConsoleSkeleton label="Loading artist console" />,
});

export function ArtistLoader() {
  return <ArtistConsole />;
}
