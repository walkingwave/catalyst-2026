"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGift, IconHome, IconMusic, IconTrophy, IconUser } from "@/components/icons";

const tabs = [
  { href: "/dashboard", label: "Home", Icon: IconHome },
  { href: "/concerts", label: "Shows", Icon: IconMusic },
  { href: "/leaderboard", label: "Ranks", Icon: IconTrophy },
  { href: "/marketplace", label: "Rewards", Icon: IconGift },
  { href: "/profile", label: "Me", Icon: IconUser },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-invert-bg text-invert-fg">
      <div className="max-w-md mx-auto grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ href, label, Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center h-14 gap-1 ${
                active ? "opacity-100" : "opacity-50"
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span className="label text-[10px]">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
