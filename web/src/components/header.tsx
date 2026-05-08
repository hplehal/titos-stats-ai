import Link from "next/link";

export function Header() {
  return (
    <header className="border-b">
      <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight hover:opacity-80"
        >
          Tito's Stats
        </Link>
        <span className="text-sm text-muted-foreground">Phase 1 — manual tracker</span>
      </div>
    </header>
  );
}
