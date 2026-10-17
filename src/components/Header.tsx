import Link from "next/link";

export function Header({ title, right }: { title?: string; right?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between mb-5">
      <Link href="/dashboard" className="font-bold tracking-tight text-lg">
        <span className="text-accent">●</span> ConcertConnect
      </Link>
      {right ?? (title ? <span className="text-muted text-sm">{title}</span> : null)}
    </header>
  );
}
