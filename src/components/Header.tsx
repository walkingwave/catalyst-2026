import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconTicket } from "@/components/icons";

/** Top bar: ticket mark + wordmark on the left, actions right. */
export function Header({ right }: { right?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between h-14">
      <Link href="/dashboard" className="inline-flex">
        <Wordmark />
      </Link>
      <div className="flex items-center gap-1">
        {right}
        <ThemeToggle />
      </div>
    </header>
  );
}

export function Wordmark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className={`inline-flex items-center gap-2 ${lg ? "" : ""}`}>
      <span className={`bg-invert-bg text-invert-fg inline-flex items-center justify-center ${lg ? "w-12 h-12" : "w-8 h-8"}`}>
        <IconTicket size={lg ? 28 : 18} strokeWidth={2.25} />
      </span>
      <span className={`display ${lg ? "d-lg" : "text-[15px]"} leading-none`}>BandDrop</span>
    </span>
  );
}
