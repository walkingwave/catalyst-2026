"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/concerts", label: "Shows", icon: "♪" },
  { href: "/leaderboard", label: "Ranks", icon: "▲" },
  { href: "/marketplace", label: "Rewards", icon: "★" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-background/90 backdrop-blur border-t border-border">
      <div className="max-w-md mx-auto grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((t) => {
          const active = path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center justify-center h-16 text-xs font-medium ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <span className="text-xl leading-none mb-1">{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
