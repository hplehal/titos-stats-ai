type Hotkey = { key: string; label: string };

const PAGE_HOTKEYS: Hotkey[] = [
  { key: "Space", label: "play / pause" },
  { key: "← / →", label: "seek ±2s" },
  { key: "R", label: "start / end rally" },
];

const RALLY_HOTKEYS: Hotkey[] = [
  { key: "H / A", label: "team" },
  { key: "1–9", label: "player" },
  { key: "Q W E F T Y U", label: "Serve Pass Set Attack Block Dig Freeball" },
  { key: "S X C", label: "Success Error Continued" },
];

export function HotkeyBar({ rallyActive }: { rallyActive: boolean }) {
  const items = rallyActive ? [...PAGE_HOTKEYS, ...RALLY_HOTKEYS] : PAGE_HOTKEYS;
  return (
    <div className="border-t bg-muted/40">
      <div className="mx-auto max-w-4xl px-6 py-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        {items.map((h) => (
          <span key={h.key} className="inline-flex items-center gap-1.5">
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] uppercase">
              {h.key}
            </kbd>
            <span>{h.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
