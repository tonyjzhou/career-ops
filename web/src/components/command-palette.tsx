"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, Compass, ListChecks } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav-items";
import { scoreTone } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Application } from "@/lib/career-ops";

type Entry =
  | { kind: "nav"; label: string; href: string }
  | { kind: "app"; n: string; company: string; role: string; score: string; status: string }
  | { kind: "action"; label: string; hint: string; run: string };

const ACTIONS: Extract<Entry, { kind: "action" }>[] = [
  { kind: "action", label: "Find new roles (free scan)", hint: "Explore", run: "/explore?run=1" },
  { kind: "action", label: "Open inbox triage", hint: "Pipeline", run: "/pipeline?tab=INBOX" },
  { kind: "action", label: "High-fit only (score ≥ 4.0)", hint: "Pipeline filter", run: "/pipeline?tab=ALL&min=4" },
];

/**
 * Command palette (⌘K / Ctrl+K): the 10x navigation move.
 * One keystroke reaches any destination or any tracked application —
 * no sidebar hunting, no table scrolling. Results rank: nav > action > app.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [apps, setApps] = useState<Application[]>([]);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sidebar button bridge (discoverable without knowing the shortcut).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onBridge = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("co:open-palette" as never, onBridge as never);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("co:open-palette" as never, onBridge as never);
    };
  }, []);

  // Lazy-load tracker rows on first open (never on page load — zero cost until used).
  useEffect(() => {
    if (!open || apps.length > 0) return;
    fetch("/api/pipeline")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.applications)) setApps(d.applications);
      })
      .catch(() => {});
  }, [open, apps.length]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open ]);

  const results: Entry[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const nav: Extract<Entry, { kind: "nav" }>[] = NAV_ITEMS.map((n) => ({ kind: "nav" as const, label: n.label, href: n.href }));
    if (!needle) return [...nav, ...ACTIONS];
    const match = (s: string) => s.toLowerCase().includes(needle);
    const navHit = nav.filter((n) => match(n.label));
    const actHit: Entry[] = ACTIONS.filter((a) => match(a.label));
    const appHit: Entry[] = apps
      .filter((a) => match(`${a.company} ${a.role} ${a.n}`))
      .slice(0, 8)
      .map((a) => ({ kind: "app", n: a.n, company: a.company, role: a.role, score: a.score, status: a.status }));
    return [...navHit, ...actHit, ...appHit];
  }, [q, apps]);

  useEffect(() => setIdx(0), [q]);

  const go = useCallback(
    (e: Entry) => {
      setOpen(false);
      if (e.kind === "nav") router.push(e.href);
      else if (e.kind === "app") router.push(`/pipeline/${e.n}`);
      else router.push(e.run);
    },
    [router],
  );

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[idx];
      if (hit) go(hit);
    }
  };

  // Keep the active row scrolled into view.
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  // Close on route change is handled by navigation itself; scrim click also closes.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open ]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/45 px-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="co-palette w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Go to, or search company / role / #…"
            aria-label="Search destinations and applications"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-faint"
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-surface-hover px-1.5 py-0.5 font-mono text-[10px] text-faint sm:block">
            esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5" role="listbox" aria-label="Results">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted">
              No matches for “{q}”. Try a company, role, or report number.
            </p>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === idx}
              onMouseEnter={() => setIdx(i)}
              onClick={() => go(r)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                i === idx ? "bg-brand-soft text-foreground" : "text-muted",
              )}
            >
              {r.kind === "nav" && (
                <>
                  {(() => {
                    const item = NAV_ITEMS.find((n) => n.label === r.label);
                    const Icon = item?.icon ?? ListChecks;
                    return <Icon className="size-4 shrink-0 text-brand" />;
                  })()}
                  <span className="font-medium">{r.label}</span>
                  <span className="ml-auto font-mono text-[11px] text-faint">{r.href}</span>
                </>
              )}
              {r.kind === "action" && (
                <>
                  <Compass className="size-4 shrink-0 text-brand" />
                  <span className="font-medium">{r.label}</span>
                  <span className="ml-auto text-[11px] text-faint">{r.hint}</span>
                </>
              )}
              {r.kind === "app" && (
                <>
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      r.score
                        ? r.kind === "app" &&
                          (scoreTone(r.score) === "good"
                            ? "bg-emerald-400"
                            : scoreTone(r.score) === "warn"
                              ? "bg-amber-400"
                              : scoreTone(r.score) === "bad"
                                ? "bg-red-400"
                                : "bg-zinc-400")
                        : "bg-zinc-400",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {r.company} <span className="font-normal text-faint">· {r.role}</span>
                  </span>
                  {r.score && <span className="shrink-0 text-xs tabular-nums text-faint">{r.score}</span>}
                  <CornerDownLeft className="size-3.5 shrink-0 text-faint" />
                </>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-faint">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border px-1 font-mono">↑↓</kbd> navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border px-1 font-mono">↵</kbd> open
          </span>
          <span className="ml-auto hidden sm:block">⌘K anywhere to open</span>
        </div>
      </div>
    </div>
  );
}
