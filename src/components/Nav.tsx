"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGift, IconHome, IconMusic, IconTrophy } from "@/components/icons";

const tabs = [
  { href: "/dashboard", label: "Home", Icon: IconHome },
  { href: "/concerts", label: "Shows", Icon: IconMusic },
  { href: "/leaderboard", label: "Ranks", Icon: IconTrophy },
  { href: "/marketplace", label: "Rewards", Icon: IconGift },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-separator">
      <div className="max-w-md mx-auto grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ href, label, Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center h-[49px] gap-0.5 ${
                active ? "text-accent" : "text-text-2"
              }`}
            >
              <Icon size={24} strokeWidth={active ? 2.25 : 2} />
              <span className="text-[10px] leading-3 font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
