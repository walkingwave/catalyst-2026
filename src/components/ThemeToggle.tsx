"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "@/components/icons";

type Theme = "light" | "dark";
const KEY = "cc_theme";

function current(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    // Read after mount so SSR markup matches regardless of stored preference.
    const t = current();
    queueMicrotask(() => setTheme(t));
  }, []);

  function toggle() {
    const next: Theme = (theme ?? current()) === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-text-2 active:bg-surface-2"
    >
      {theme === "dark" ? <IconSun size={22} /> : <IconMoon size={22} />}
    </button>
  );
}
