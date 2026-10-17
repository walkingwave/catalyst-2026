import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from "react";
import { IconChevron } from "@/components/icons";

/* Layout -------------------------------------------------------------- */

export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main
      className={`flex-1 w-full max-w-md mx-auto px-4 pt-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] ${className}`}
    >
      {children}
    </main>
  );
}

/** Page headline: condensed uppercase display type, hard rule under it. */
export function Headline({ children, sub, kicker }: { children: ReactNode; sub?: ReactNode; kicker?: ReactNode }) {
  return (
    <div className="pt-4 pb-4 border-b-2 border-line mb-4">
      {kicker && <p className="label text-ink-2 mb-2">{kicker}</p>}
      <h1 className="display d-xl">{children}</h1>
      {sub && <p className="t-sub text-ink-2 mt-2">{sub}</p>}
    </div>
  );
}

export function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between pt-7 pb-2 border-b-2 border-line mb-3">
      <h2 className="display d-sm">{children}</h2>
      {action && <span className="label text-ink-2">{action}</span>}
    </div>
  );
}

/* Surfaces ------------------------------------------------------------ */

/** Bordered panel. `invert` makes a solid black (or white in dark) block. */
export function Panel({
  children,
  className = "",
  invert = false,
}: {
  children: ReactNode;
  className?: string;
  invert?: boolean;
}) {
  return (
    <div
      className={`${invert ? "bg-invert-bg text-invert-fg" : "bg-surface border border-line"} ${className}`}
    >
      {children}
    </div>
  );
}

/** Bordered list with hairline rules between rows. */
export function List({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-line rules ${className}`}>{children}</div>;
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
  valueTone?: "default" | "success" | "muted";
  leading?: ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  selected?: boolean;
}) {
  const tone = { default: "text-ink", success: "text-success", muted: "text-ink-2" }[valueTone];
  const inner = (
    <>
      {leading && <div className="shrink-0 mr-3 flex items-center">{leading}</div>}
      <div className="flex-1 min-w-0 py-3">
        <p className="t-body truncate">{title}</p>
        {subtitle && <p className="t-foot text-ink-2 truncate mt-0.5">{subtitle}</p>}
      </div>
      {value !== undefined && <span className={`display d-sm t-num ml-3 ${tone}`}>{value}</span>}
      {(chevron || href) && <IconChevron size={18} className="text-ink-3 ml-1 -mr-1 shrink-0" />}
    </>
  );
  const cls = `flex items-center min-h-[48px] px-4 w-full text-left ${
    selected ? "bg-invert-bg text-invert-fg" : ""
  } ${href || onClick ? "active:bg-surface-2" : ""}`;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/* Controls ------------------------------------------------------------ */

type Variant = "filled" | "outline" | "plain" | "danger";
const variantCls: Record<Variant, string> = {
  filled: "bg-invert-bg text-invert-fg border-2 border-invert-bg",
  outline: "bg-transparent text-ink border-2 border-line",
  plain: "bg-transparent text-ink underline underline-offset-4",
  danger: "bg-danger text-white border-2 border-danger",
};

export function Button({
  children,
  variant = "filled",
  size = "lg",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "lg" | "md" }) {
  const h = size === "lg" ? "h-14" : "h-12";
  return (
    <button
      className={`w-full ${h} display d-sm flex items-center justify-center gap-2 active:opacity-70 disabled:opacity-40 ${variantCls[variant]} ${className}`}
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
      className={`w-full h-14 display d-sm flex items-center justify-center gap-2 active:opacity-70 ${variantCls[variant]}`}
    >
      {children}
    </Link>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full h-14 bg-surface border-2 border-line px-4 t-body outline-none focus:bg-surface-2 placeholder:text-ink-3"
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label text-ink-2 block mb-2">{label}</span>
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
  invert = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  href?: string;
  invert?: boolean;
}) {
  const body = (
    <Panel invert={invert} className="p-4 h-full">
      <p className={`label ${invert ? "text-invert-fg/70" : "text-ink-2"}`}>{label}</p>
      <p className="display d-xl t-num mt-3">{value}</p>
      {sub && <p className={`t-foot mt-1 truncate ${invert ? "text-invert-fg/70" : "text-ink-2"}`}>{sub}</p>}
    </Panel>
  );
  return href ? <Link href={href} className="block active:opacity-70">{body}</Link> : body;
}

export function Badge({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "success" | "warning" }) {
  const cls = {
    ink: "bg-invert-bg text-invert-fg",
    success: "bg-success text-white",
    warning: "bg-warning text-black",
  }[tone];
  return <span className={`inline-flex items-center h-6 px-2 label ${cls}`}>{children}</span>;
}

export function Banner({ children, tone = "success" }: { children: ReactNode; tone?: "success" | "warning" }) {
  const cls = tone === "success" ? "bg-success text-white" : "bg-warning text-black";
  return <div className={`px-4 py-3 t-sub font-semibold ${cls}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="t-sub text-ink-2 text-center py-10 px-6">{children}</p>;
}
