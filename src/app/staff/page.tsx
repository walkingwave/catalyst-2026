import type { Metadata } from "next";
import { StaffLoader } from "./StaffLoader";

export const metadata: Metadata = { title: "Staff · BandDrop", robots: { index: false } };

export default function StaffPage() {
  return <StaffLoader />;
}
