import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    <span
      className={`ticket-mark inline-flex items-center justify-center bg-invert-bg text-invert-fg display ${
        lg ? "h-12 px-5 text-[22px]" : "h-8 px-3.5 text-[12px]"
      } leading-none`}
    >
      BandDrop
    </span>
  );
}
