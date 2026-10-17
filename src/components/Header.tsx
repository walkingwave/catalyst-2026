import Link from "next/link";
import { IconLogo } from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Compact top bar: brand on the left, actions on the right. Pages put their own large title below. */
export function Header({ right }: { right?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between h-12">
      <Link href="/dashboard" className="flex items-center gap-2 text-accent">
        <IconLogo size={24} />
        <span className="t-headline text-text">ConcertConnect</span>
      </Link>
      <div className="flex items-center gap-1">
        {right}
        <ThemeToggle />
      </div>
    </header>
  );
}
