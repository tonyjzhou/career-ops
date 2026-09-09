"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronsUpDown, X, Compass, ArrowRight, ArrowUpDown } from "lucide-react";
import type { Application, InboxJob } from "@/lib/career-ops";
import { Badge } from "@/components/ui/badge";
import { CompanyLogo } from "@/components/company-logo";
import { canonStatus, scoreNum, scoreTone, statusDot } from "@/lib/format";
import { InboxTriage } from "@/components/inbox/inbox-triage";
import { cn } from "@/lib/cn";

// INBOX (the triage queue) is the default tab; the rest filter the tracker.
const TABS = [
  "INBOX",
  "ALL",
  "EVALUATED",
  "APPLIED",
  "RESPONDED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "DISCARDED",
  "SKIP",
] as const;
type Tab = (typeof TABS)[number];

const SORT_KEYS = ["company", "role", "score", "status", "date"] as const;
type SortKey = (typeof SORT_KEYS)[number];

// Visible score presets — previously URL-only (?min=), so most users never
// found the highest-ROI filter in the app. One tap: high-fit only.
const SCORE_PRESETS: { label: string; min: number | null }[] = [
  { label: "Any score", min: null },
  { label: "3.0+", min: 3 },
  { label: "3.5+", min: 3.5 },
  { label: "4.0+ apply line", min: 4 },
  { label: "4.5+ top", min: 4.5 },
];

export function PipelineView({
  applications,
  inbox,
}: {
  applications: Application[];
  inbox: InboxJob[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // The URL is the SINGLE source of truth for tab/min/sort/dir, so the home stat
  // tiles' deep links AND the assistant's filterPipeline/navigate actions drive
  // the table identically (no useState mirror → no desync).
  const pTab = (params.get("tab") ?? "").toUpperCase();
  const tab: Tab = (TABS as readonly string[]).includes(pTab) ? (pTab as Tab) : "INBOX";
  const pMin = parseFloat(params.get("min") ?? "");
  const minFilter: number | null = Number.isFinite(pMin) ? pMin : null;
  const pSort = params.get("sort") ?? "";
  const sortKey: SortKey = (SORT_KEYS as readonly string[]).includes(pSort) ? (pSort as SortKey) : "score";
  const sort = { key: sortKey, dir: (params.get("dir") === "1" ? 1 : -1) as 1 | -1 };

  // Search stays LOCAL for snappy typing; seeded from the URL and re-synced only
  // when the URL's q changes (i.e. the assistant set it) — never per keystroke.
  const [q, setQ] = useState(params.get("q") ?? "");
  const lastUrlQ = useRef(params.get("q") ?? "");
  useEffect(() => {
    const urlQ = params.get("q") ?? "";
    if (urlQ !== lastUrlQ.current) {
      lastUrlQ.current = urlQ;
      setQ(urlQ);
    }
  }, [params]);

  const setParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === "") sp.delete(k);
        else sp.set(k, String(v));
      }
      const qs = sp.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [params, router, pathname],
  );

  // Pending + deduped by URL (pipeline.md can list the same posting twice) so the
  // header count, the tab count and the triage list all agree on one number.
  const pendingInbox = useMemo(() => {
    const seen = new Set<string>();
    const out: InboxJob[] = [];
    for (const j of inbox) {
      if (j.done || seen.has(j.url)) continue;
      seen.add(j.url);
      out.push(j);
    }
    return out;
  }, [inbox]);

  const filtered = useMemo(() => {
    if (tab === "INBOX") return [];
    let rows = applications;
    if (tab !== "ALL") rows = rows.filter((r) => canonStatus(r.status).includes(tab));
    if (minFilter != null) {
      rows = rows.filter((r) => {
        const n = scoreNum(r.score);
        return !Number.isNaN(n) && n >= minFilter;
      });
    }
    if (q.trim()) {
      const needle = q.toLowerCase();
      rows = rows.filter((r) => `${r.company} ${r.role} ${r.n}`.toLowerCase().includes(needle));
    }
    return [...rows].sort((a, b) => {
      if (sort.key === "score") {
        const an = scoreNum(a.score);
        const bn = scoreNum(b.score);
        const av = Number.isNaN(an) ? -Infinity : an;
        const bv = Number.isNaN(bn) ? -Infinity : bn;
        return (av - bv) * sort.dir;
      }
      return (a[sort.key] || "").localeCompare(b[sort.key] || "") * sort.dir;
    });
  }, [applications, tab, q, sort, minFilter]);

  // Keyboard triage: j/k moves, Enter opens, / focuses search.
  // Turns a 100-row scan into a keyboard flow — the power-user 10x.
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [tab, q, minFilter, sortKey]);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (tab === "INBOX" || filtered.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const row = filtered[active];
        if (row) router.push(`/pipeline/${row.n}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, filtered, active, router]);

  const isFiltered = q.trim() !== "" || minFilter != null;
  const clearAll = useCallback(() => {
    setQ("");
    setParams({ q: null, min: null });
  }, [setParams]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 max-sm:pb-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-landing">Pipeline</h1>
          <p className="mt-1 text-sm text-muted" aria-live="polite">
            <span className="tabular-nums">{pendingInbox.length}</span> in inbox ·{" "}
            <span className="tabular-nums">{applications.length}</span> tracked
            {tab !== "INBOX" && (
              <>
                {" "}· <span className="tabular-nums text-foreground">{filtered.length}</span> shown
              </>
            )}
          </p>
        </div>
        {/* the tracker has its own search; the inbox brings its own facet filters */}
        {tab !== "INBOX" && (
          <div className="relative w-64 max-w-[60vw]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQ("");
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="Search company, role, or #…  ( / )"
              aria-label="Search tracked applications"
              className="w-full rounded-md border border-border bg-surface/60 py-2 pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-faint focus:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/40"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* tabs */}
      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Pipeline stages">
        {TABS.map((t) => {
          const count =
            t === "INBOX"
              ? pendingInbox.length
              : t === "ALL"
                ? applications.length
                : applications.filter((r) => canonStatus(r.status).includes(t)).length;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setParams({ tab: t === "INBOX" ? null : t })}
              className={cn(
                "-mb-px inline-flex shrink-0 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors max-sm:min-h-[44px]",
                tab === t
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {t} <span className="tabular-nums text-faint">{count}</span>
            </button>
          );
        })}
      </div>

      {/* score presets — the previously-hidden power filter, now one tap */}
      {tab !== "INBOX" && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Filter by score">
          <ArrowUpDown className="size-3.5 text-faint" aria-hidden />
          {SCORE_PRESETS.map((p) => {
            const selected = (p.min ?? null) === minFilter;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setParams({ min: p.min })}
                aria-pressed={selected}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors max-sm:min-h-[36px]",
                  selected
                    ? "border-brand/50 bg-brand-soft text-brand-text"
                    : "border-border text-muted hover:border-brand/30 hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            );
          })}
          {isFiltered && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-faint transition-colors hover:text-foreground max-sm:min-h-[36px]"
            >
              <X className="size-3" /> Clear
            </button>
          )}
        </div>
      )}

      {tab === "INBOX" ? (
        /* ── Inbox: the triage surface (Abundance → Triage → Shortlist → Score) ── */
        pendingInbox.length > 0 ? (
          <InboxTriage inbox={pendingInbox} />
        ) : (
          <InboxEmpty count={0} filtered={false} />
        )
      ) : filtered.length > 0 ? (
        <>
          <p className="mt-3 text-xs text-faint max-sm:hidden" aria-hidden>
            Tip: <kbd className="rounded border border-border px-1 font-mono">j</kbd>/<kbd className="rounded border border-border px-1 font-mono">k</kbd> to move · <kbd className="rounded border border-border px-1 font-mono">↵</kbd> to open · <kbd className="rounded border border-border px-1 font-mono">/</kbd> to search
          </p>
          {/* ── Desktop table (sticky header survives long scans) ── */}
          <div className="mt-3 hidden overflow-hidden rounded-2xl border border-border sm:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-left text-xs uppercase tracking-wide text-faint">
                <tr>
                  {SORT_KEYS.map((k) => (
                    <th
                      key={k}
                      className="cursor-pointer select-none px-4 py-2.5 font-medium hover:text-foreground"
                      onClick={() => setParams({ sort: k, dir: sort.key === k ? sort.dir * -1 : -1 })}
                      aria-sort={sort.key === k ? (sort.dir === -1 ? "descending" : "ascending") : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {k}
                        <ChevronsUpDown className={cn("size-3", sort.key === k && "text-brand")} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r, i) => (
                  <tr
                    key={`${r.n}-${i}`}
                    className={cn(
                      "group transition-colors hover:bg-surface/40",
                      i === active && "bg-brand-soft/40",
                    )}
                    onMouseEnter={() => setActive(i)}
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/pipeline/${r.n}`} className="flex items-center gap-2.5 transition-colors group-hover:text-brand">
                        <CompanyLogo name={r.company} size={20} />
                        {r.company}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <Link href={`/pipeline/${r.n}`}>{r.role}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={scoreTone(r.score)}>{r.score || "—"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cn("size-1.5 shrink-0 rounded-full", statusDot(r.status))} />
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-faint tabular-nums">{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* ── Mobile cards (the table used to clip under overflow-x-hidden) ── */}
          <ul className="mt-3 space-y-2 sm:hidden">
            {filtered.map((r) => (
              <li key={`m-${r.n}`}>
                <Link
                  href={`/pipeline/${r.n}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface/40 px-3.5 py-3 active:bg-surface-hover"
                >
                  <CompanyLogo name={r.company} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.company}</span>
                    <span className="block truncate text-xs text-muted">{r.role}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
                      <span className={cn("size-1.5 rounded-full", statusDot(r.status))} />
                      {r.status} · <span className="tabular-nums">{r.date}</span>
                    </span>
                  </span>
                  <Badge tone={scoreTone(r.score)}>{r.score || "—"}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface/30 px-6 py-12 text-center">
          <p className="font-display text-lg">No matches</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            {isFiltered ? "Nothing passes these filters — loosen them to see more." : "Try a different tab or clear the search."}
          </p>
          {isFiltered && (
            <button
              type="button"
              onClick={clearAll}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-brand/40 hover:text-foreground"
            >
              <X className="size-3.5" /> Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Empty inbox. Self-sufficient for the mainstream user (a primary in-web action),
// honest for devs (the CLI/file path stays, demoted to progressive transparency).
function InboxEmpty({ count, filtered }: { count: number; filtered: boolean }) {
  if (filtered) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface/30 px-6 py-12 text-center">
        <p className="font-display text-lg">No matches</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Clear the search to see the full inbox.</p>
      </div>
    );
  }
  return (
    <div className="dot-bg mt-4 overflow-hidden rounded-2xl border border-border bg-surface/50 bg-origin-border bg-gradient-to-tr from-brand/10 via-transparent to-transparent shadow-lg">
      <div className="flex items-center gap-2 border-b border-foreground/10 px-5 py-3">
        <span className="size-2.5 rounded-full bg-foreground/15" aria-hidden="true" />
        <span className="size-2.5 rounded-full bg-foreground/15" aria-hidden="true" />
        <span className="size-2.5 rounded-full bg-foreground/15" aria-hidden="true" />
        <span className="ml-3 font-mono text-xs tracking-wide text-muted">career-ops · inbox</span>
      </div>
      <div className="px-6 py-10 text-center">
        <p className="font-display text-lg">
          Your <span className="text-brand">inbox</span> is empty.
        </p>
        {count > 0 ? (
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">Nothing pending right now.</p>
        ) : (
          <>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">Find roles that match your CV — free, no tokens spent.</p>
            <Link
              href="/explore?run=1"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground shadow-sm transition-all duration-200 hover:bg-brand-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <Compass className="size-4" /> Run your first free scan <ArrowRight className="size-4" />
            </Link>
            <p className="mx-auto mt-4 max-w-sm text-xs text-muted">
              Prefer the terminal? Run <code className="rounded bg-surface-hover px-1 py-0.5 font-mono">career-ops scan</code>, or add job URLs to{" "}
              <code className="rounded bg-surface-hover px-1 py-0.5 font-mono">data/pipeline.md</code>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
