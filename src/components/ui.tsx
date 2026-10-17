import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from "react";
import { IconChevron } from "@/components/icons";

/* Layout -------------------------------------------------------------- */

export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main
      className={`flex-1 w-full max-w-md mx-auto px-4 pt-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))] ${className}`}
    >
      {children}
    </main>
  );
}

export function LargeTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="pt-2 pb-4">
      <h1 className="t-large-title">{children}</h1>
      {sub && <p className="t-subhead text-text-2 mt-1">{sub}</p>}
    </div>
  );
}

export function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between px-1 pt-6 pb-2">
      <h2 className="t-footnote uppercase tracking-wide text-text-2 font-medium">{children}</h2>
      {action && <span className="t-footnote text-accent">{action}</span>}
    </div>
  );
}

/* Surfaces ------------------------------------------------------------ */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[16px] bg-surface card-shadow ${className}`}>{children}</div>;
}

/** Inset grouped list. Children are rows. */
export function List({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <Card className={`overflow-hidden hairline-b ${className}`}>{children}</Card>;
}

export function Row({
  title,
  subtitle,
  value,
  valueTone = "default",
  leading,
  href,
  onClick,
  chevron,
  selected,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  valueTone?: "default" | "accent" | "success" | "muted";
  leading?: ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  selected?: boolean;
}) {
  const tone = {
    default: "text-text",
    accent: "text-accent",
    success: "text-success",
    muted: "text-text-2",
  }[valueTone];
  const inner = (
    <>
      {leading && <div className="shrink-0 mr-3 flex items-center">{leading}</div>}
      <div className="flex-1 min-w-0 py-3">
        <p className="t-body truncate">{title}</p>
        {subtitle && <p className="t-footnote text-text-2 truncate mt-0.5">{subtitle}</p>}
      </div>
      {value !== undefined && <span className={`t-body t-num ml-3 ${tone}`}>{value}</span>}
      {(chevron || href) && <IconChevron size={18} className="text-text-3 ml-1 -mr-1 shrink-0" />}
    </>
  );
  const cls = `flex items-center min-h-[44px] px-4 w-full text-left ${selected ? "bg-accent-soft" : ""} ${
    href || onClick ? "active:bg-surface-2 transition-colors" : ""
  }`;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/* Controls ------------------------------------------------------------ */

type Variant = "filled" | "tinted" | "plain" | "danger";
const variantCls: Record<Variant, string> = {
  filled: "bg-accent text-on-accent",
  tinted: "bg-accent-soft text-accent",
  plain: "bg-transparent text-accent",
  danger: "bg-danger-soft text-danger",
};

export function Button({
  children,
  variant = "filled",
  size = "lg",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "lg" | "md" }) {
  const h = size === "lg" ? "h-[50px] t-headline" : "h-11 t-subhead font-semibold";
  return (
    <button
      className={`w-full ${h} rounded-[12px] flex items-center justify-center gap-2 active:opacity-70 transition-opacity disabled:opacity-40 ${variantCls[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "filled",
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <Link
      href={href}
      className={`w-full h-[50px] t-headline rounded-[12px] flex items-center justify-center gap-2 active:opacity-70 transition-opacity ${variantCls[variant]}`}
    >
      {children}
    </Link>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full h-[50px] rounded-[12px] bg-surface border border-separator px-4 t-body outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft placeholder:text-text-3"
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="t-footnote text-text-2 block mb-1.5 px-1">{label}</span>
      {children}
    </label>
  );
}

/* Data display -------------------------------------------------------- */

export function Points({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`t-num ${className}`}>{value.toLocaleString()}</span>;
}

export function StatTile({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  href?: string;
}) {
  const body = (
    <Card className="p-4 h-full">
      <p className="t-footnote text-text-2">{label}</p>
      <p className="t-title1 t-num mt-1">{value}</p>
      {sub && <p className="t-footnote text-text-2 mt-1 truncate">{sub}</p>}
    </Card>
  );
  return href ? <Link href={href} className="block active:opacity-70">{body}</Link> : body;
}

export function Badge({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: "accent" | "success" | "warning" | "neutral";
}) {
  const cls = {
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    neutral: "bg-surface-2 text-text-2",
  }[tone];
  return (
    <span className={`inline-flex items-center h-6 px-2 rounded-md t-caption font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export function Banner({ children, tone = "success" }: { children: ReactNode; tone?: "success" | "warning" }) {
  const cls = tone === "success" ? "bg-success-soft text-success" : "bg-warning-soft text-warning";
  return <div className={`rounded-[12px] px-4 py-3 t-subhead font-medium ${cls}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="t-subhead text-text-2 text-center py-10 px-6">{children}</p>;
}
