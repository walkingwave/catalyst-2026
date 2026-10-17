import type { Metadata } from "next";
import { AdminLoader } from "./AdminLoader";

export const metadata: Metadata = { title: "Admin · ConcertConnect", robots: { index: false } };

export default function AdminPage() {
  return <AdminLoader />;
}
