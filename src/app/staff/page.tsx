import type { Metadata } from "next";
import { StaffLoader } from "./StaffLoader";

export const metadata: Metadata = { title: "Staff · ConcertConnect", robots: { index: false } };

export default function StaffPage() {
  return <StaffLoader />;
}
