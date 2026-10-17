import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes } from "react";

export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main className={`flex-1 w-full max-w-md mx-auto px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] ${className}`}>{children}</main>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-card border border-border p-4 ${className}`}>{children}</div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const base =
    "w-full h-14 rounded-2xl text-lg font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50 disabled:active:scale-100";
  const styles = {
    primary: "bg-accent text-accent-fg",
    secondary: "bg-card border border-border text-foreground",
    ghost: "text-muted",
  }[variant];
  return (
    <button className={`${base} ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const styles =
    variant === "primary" ? "bg-accent text-accent-fg" : "bg-card border border-border text-foreground";
  return (
    <Link
      href={href}
      className={`w-full h-14 rounded-2xl text-lg font-semibold flex items-center justify-center active:scale-[0.98] transition ${styles}`}
    >
      {children}
    </Link>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full h-14 rounded-2xl bg-card border border-border px-4 text-lg outline-none focus:border-accent placeholder:text-muted"
      {...props}
    />
  );
}

export function Points({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`font-mono tabular-nums ${className}`}>{value.toLocaleString()}</span>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-accent/15 text-accent text-xs font-semibold px-2.5 py-1">
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted text-center py-10">{children}</p>;
}
