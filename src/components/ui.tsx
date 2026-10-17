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
    <div className="pt-4 pb-5">
      {kicker && <p className="label text-ink-2 mb-2">{kicker}</p>}
      <h1 className="display d-xl">{children}</h1>
      {sub && <p className="t-sub text-ink-2 mt-2">{sub}</p>}
    </div>
  );
}

export function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between pt-8 pb-3">
      <h2 className="display d-sm">{children}</h2>
      {action && <span className="label text-ink-2">{action}</span>}
    </div>
  );
}

/* Surfaces ------------------------------------------------------------ */

/** Tonal panel. `invert` makes a solid black (or white in dark) block. */
export function Panel({
  children,
  className = "",
  invert = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  invert?: boolean;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return (
    <div
      className={`${invert ? "bg-invert-bg text-invert-fg" : "bg-surface-2"} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

/** List with hairline rules between rows. */
export function List({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rules ${className}`}>{children}</div>;
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
  const tone = selected
    ? "text-invert-fg"
    : { default: "text-ink", success: "text-success", muted: "text-ink-2" }[valueTone];
  const inner = (
    <>
      {leading && <div className="shrink-0 mr-3 flex items-center">{leading}</div>}
      <div className="flex-1 min-w-0 py-3">
        <p className="t-body truncate">{title}</p>
        {subtitle && <p className={`t-foot truncate mt-0.5 ${selected ? "text-invert-fg/70" : "text-ink-2"}`}>{subtitle}</p>}
      </div>
      {value !== undefined && <span className={`display d-sm t-num ml-3 ${tone}`}>{value}</span>}
      {(chevron || href) && <IconChevron size={18} className="text-ink-3 ml-1 -mr-1 shrink-0" />}
    </>
  );
  const cls = `flex items-center min-h-[52px] px-1 w-full text-left ${
    selected ? "bg-invert-bg text-invert-fg px-4 -mx-0" : ""
  } ${href || onClick ? "press" : ""}`;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/* Controls ------------------------------------------------------------ */

type Variant = "filled" | "outline" | "plain" | "danger";
const variantCls: Record<Variant, string> = {
  filled: "bg-invert-bg text-invert-fg",
  outline: "bg-surface-2 text-ink",
  plain: "bg-transparent text-ink underline underline-offset-4",
  danger: "bg-danger text-white",
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
      className={`w-full ${h} display d-sm flex items-center justify-center gap-2 press disabled:opacity-40 ${variantCls[variant]} ${className}`}
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
      className={`w-full h-14 display d-sm flex items-center justify-center gap-2 press ${variantCls[variant]}`}
    >
      {children}
    </Link>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full h-14 bg-surface-2 border-b-2 border-transparent px-4 t-body outline-none focus:border-line placeholder:text-ink-3"
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

/* Ticket --------------------------------------------------------------- */

/** Deterministic fake barcode from any string (serial, code, id). Purely decorative. */
export function Barcode({ value, className = "", height = 28 }: { value: string; className?: string; height?: number }) {
  let h = 2166136261;
  const bars: number[] = [];
  for (let i = 0; i < 48; i++) {
    h ^= value.charCodeAt(i % Math.max(value.length, 1)) + i;
    h = Math.imul(h, 16777619) >>> 0;
    bars.push(1 + (h % 3));
  }
  return (
    <svg viewBox={`0 0 ${bars.reduce((a, b) => a + b + 1, 0)} 10`} preserveAspectRatio="none" className={className} style={{ height }} aria-hidden>
      {bars.reduce<{ x: number; els: React.ReactNode[] }>(
        (acc, w, i) => {
          acc.els.push(<rect key={i} x={acc.x} y="0" width={w} height="10" fill="currentColor" />);
          acc.x += w + 1;
          return acc;
        },
        { x: 0, els: [] },
      ).els}
    </svg>
  );
}

/**
 * Ticket stub. `main` above the tear, `stub` below it. Notches sit on the tear line.
 * Pass `serial` to print a ticket number + barcode in the stub.
 */
export function Ticket({
  main,
  stub,
  invert = false,
  rail,
  serial,
  className = "",
}: {
  main: ReactNode;
  stub?: ReactNode;
  invert?: boolean;
  rail?: string;
  serial?: string;
  className?: string;
}) {
  const tone = invert ? "bg-invert-bg text-invert-fg" : "bg-surface-2 text-ink";
  return (
    <div className={`ticket overflow-hidden ${tone} ${className}`}>
      <div className="flex">
        {rail && (
          <div className={`shrink-0 w-9 flex items-center justify-center border-r border-dashed ${invert ? "border-invert-fg/40" : "border-line-soft"}`}>
            <span className="stub-tab mono-caps text-[10px] opacity-70">{rail}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="p-5">{main}</div>
          {stub && (
            <>
              {/* with a rail the row starts 16px inside the left edge, so the notch shifts right by 32px */}
              <div className={`tear-row mx-4 ${rail ? "-ml-[52px] pl-[52px]" : ""}`} style={rail ? ({ ["--notch-left" as string]: "5px" } as React.CSSProperties) : undefined}>
                <div className="tear" />
              </div>
              <div className="px-5 py-4">
                {stub}
                {serial && (
                  <div className="mt-3 flex items-end gap-3">
                    <Barcode value={serial} className="w-full" />
                    <span className="mono-caps text-[10px] opacity-70 whitespace-nowrap">{serial}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** SEC / ROW / SEAT style detail cell. */
export function TicketField({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mono-caps text-[10px] opacity-70">{label}</p>
      <p className="display d-lg t-num mt-1 break-words">{value}</p>
      {sub && <p className="t-foot opacity-70 truncate">{sub}</p>}
    </div>
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
  return href ? <Link href={href} className="block press">{body}</Link> : body;
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
  return <p className="t-sub text-ink-2 py-6">{children}</p>;
}
