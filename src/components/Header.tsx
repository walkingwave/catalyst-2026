import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Top bar: wordmark block on the left (Fandrop-style sticker), actions right. */
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
  const cls = size === "lg" ? "px-3 py-2 d-lg" : "px-2 py-1.5 text-[13px] leading-[0.95]";
  return (
    <span className={`display bg-invert-bg text-invert-fg inline-block text-left ${cls}`}>
      Concert
      <br />
      Connect
    </span>
  );
}
