import type { Metadata } from "next";
import { ArtistLoader } from "./ArtistLoader";

export const metadata: Metadata = { title: "Artist console · ConcertConnect", robots: { index: false } };

export default function ArtistPage() {
  return <ArtistLoader />;
}
