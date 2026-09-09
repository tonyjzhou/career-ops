import Link from "next/link";
import { pipelineSummary } from "@/lib/career-ops";
import { canonStatus, scoreNum } from "@/lib/format";

export const dynamic = "force-dynamic";

const STAGES: { key: string; label: string; href: string }[] = [
  { key: "EVALUATED", label: "Evaluated", href: "/pipeline?tab=EVALUATED" },
  { key: "APPLIED", label: "Applied", href: "/pipeline?tab=APPLIED" },
  { key: "RESPONDED", label: "Responded", href: "/pipeline?tab=RESPONDED" },
  { key: "INTERVIEW", label: "Interview", href: "/pipeline?tab=INTERVIEW" },
  { key: "OFFER", label: "Offer", href: "/pipeline?tab=OFFER" },
  { key: "REJECTED", label: "Rejected", href: "/pipeline?tab=REJECTED" },
  { key: "DISCARDED", label: "Discarded", href: "/pipeline?tab=DISCARDED" },
];

export default function Analytics() {
  const { applications } = pipelineSummary();
  const total = applications.length;

  const stageCounts = STAGES.map((s) => ({
    ...s,
    n: applications.filter((a) => canonStatus(a.status).includes(s.key)).length,
  }));
  const maxStage = Math.max(1, ...stageCounts.map((s) => s.n));

  const scores = applications.map((a) => scoreNum(a.score)).filter((n) => !Number.isNaN(n));
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const highFit = scores.filter((n) => n >= 4).length;
  const buckets = [
    { label: "4.5 – 5.0", test: (n: number) => n >= 4.5 },
    { label: "4.0 – 4.4", test: (n: number) => n >= 4 && n < 4.5 },
    { label: "3.0 – 3.9", test: (n: number) => n >= 3 && n < 4 },
    { label: "< 3.0", test: (n: number) => n < 3 },
  ].map((b) => ({ label: b.label, n: scores.filter(b.test).length }));
  const maxBucket = Math.max(1, ...buckets.map((b) => b.n));

  const companyCounts = new Map<string, number>();
  for (const a of applications) if (a.company) companyCounts.set(a.company, (companyCounts.get(a.company) ?? 0) + 1);
  const topCompanies = [...companyCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxCompany = Math.max(1, ...topCompanies.map((c) => c[1]));

  const get = (k: string) => stageCounts.find((s) => s.key === k)?.n ?? 0;
  const applied = get("APPLIED");
  const responded = get("RESPONDED");
  const interviews = get("INTERVIEW");
  const offers = get("OFFER");

  // Funnel conversion — the numbers that actually change behavior.
  // Applied→Response measures targeting quality; Response→Interview measures momentum.
  const appliedBase = Math.max(1, applied + responded + interviews + offers);
  const responseRate = Math.round(((responded + interviews + offers) / appliedBase) * 100);
  const interviewRate = interviews + offers > 0 && responded + interviews + offers > 0
    ? Math.round(((interviews + offers) / (responded + interviews + offers)) * 100)
    : 0;

  // One-line diagnosis: the single bottleneck worth fixing this week.
  const insight =
    total === 0
      ? null
      : applied === 0
        ? { title: "Evaluate, then apply", body: `You have ${total} tracked but 0 applied — pick your highest-scored role and move it forward.`, href: "/pipeline?tab=ALL&min=4", cta: "See high-fit roles" }
        : responseRate < 15 && applied >= 5
          ? { title: "Targeting looks off", body: `~${responseRate}% response on ${appliedBase} applications. Raise the bar — apply only ≥4.0 and tailor the CV first.`, href: "/pipeline?tab=ALL&min=4", cta: "Review high-fit only" }
          : interviews === 0 && responded > 0
            ? { title: "Replies are stalling", body: `${responded} response${responded === 1 ? "" : "s"} but no interviews yet — follow up within 5 business days.`, href: "/", cta: "Check follow-ups due" }
            : { title: "Funnel is moving", body: `${responseRate}% response · ${interviewRate}% of responses reached interview. Keep the top of funnel fed.`, href: "/explore", cta: "Find new roles" };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 max-sm:pb-28">
      <h1 className="font-display text-2xl tracking-tight text-landing">Analytics</h1>
      <p className="mt-1 text-sm text-muted">Across {total} tracked evaluations.</p>

      {/* headline stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat value={total} label="evaluated" />
        <Stat value={avg ? avg.toFixed(2) : "—"} label="avg score" sub={scores.length > 0 ? `${highFit} ≥ 4.0 apply-line` : undefined} />
        <Stat
          value={`${responseRate}%`}
          label="response rate"
          sub={appliedBase > 1 ? `${responded + interviews + offers}/${appliedBase} replied` : undefined}
          hint={interviews === 0 && applied > 0 ? "Keep follow-ups warm →" : undefined}
        />
        <Stat
          value={offers}
          label="offers"
          hint={offers === 0 && interviews > 0 ? "Close the loop on interviews →" : undefined}
        />
      </div>

      {insight && (
        <div className="mt-6 rounded-2xl border border-brand/25 bg-brand-soft/50 px-5 py-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand/80">This week&apos;s focus · {insight.title}</p>
          <p className="mt-1.5 text-sm leading-relaxed">{insight.body}</p>
          <Link href={insight.href} className="mt-2 inline-flex min-h-[36px] items-center text-sm font-medium text-brand hover:underline">
            {insight.cta} →
          </Link>
        </div>
      )}

      <Section title="Pipeline by stage">
        {stageCounts.map((s) => (
          <LinkBar
            key={s.key}
            label={s.label}
            href={s.href}
            value={s.n}
            pct={(s.n / maxStage) * 100}
            total={total}
            tone={s.key === "OFFER" ? "positive" : "neutral"}
          />
        ))}
      </Section>

      <Section title="Score distribution">
        {buckets.map((b) => (
          <Bar key={b.label} label={b.label} value={b.n} pct={(b.n / maxBucket) * 100} total={scores.length} />
        ))}
        {scores.length > 0 && (
          <p className="pt-1 text-xs text-faint">
            4.0 is the apply line — everything below it should be a deliberate exception, not the default.
          </p>
        )}
      </Section>

      <Section title="Top companies" id="companies">
        {topCompanies.length === 0 && (
          <p className="text-sm text-muted">
            Nothing tracked yet. <Link href="/explore" className="text-brand hover:underline">Find your first roles</Link>.
          </p>
        )}
        {topCompanies.map(([name, n]) => (
          <Bar key={name} label={name} value={n} pct={(n / maxCompany) * 100} />
        ))}
      </Section>
    </div>
  );
}

function Stat({ value, label, sub, hint }: { value: number | string; label: string; sub?: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/50 p-4">
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-faint">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] tabular-nums text-muted">{sub}</div>}
      {hint && (
        <Link href="/" className="mt-2 block min-h-[24px] text-xs text-muted transition-colors hover:text-brand">
          {hint}
        </Link>
      )}
    </div>
  );
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-10 scroll-mt-8">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{title}</h2>
      <div className="mt-4 space-y-2.5">{children}</div>
    </section>
  );
}

// Stage bars deep-link into the filtered pipeline — every chart is a door, not a picture.
function LinkBar({
  label,
  href,
  value,
  pct,
  total,
  tone = "neutral",
}: {
  label: string;
  href: string;
  value: number;
  pct: number;
  total?: number;
  tone?: "neutral" | "positive";
}) {
  const share = total && total > 0 ? Math.round((value / total) * 100) : null;
  const fill =
    tone === "positive"
      ? "bg-gradient-to-r from-emerald-500/60 to-emerald-500/30"
      : "bg-gradient-to-r from-foreground/25 to-foreground/10";
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-lg px-1 py-0.5 transition-colors hover:bg-surface/40" aria-label={`${label}: ${value} — view in pipeline`}>
      <div className="w-32 shrink-0 truncate text-sm text-muted group-hover:text-foreground">{label}</div>
      <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-surface">
        <div
          className={`h-full rounded-md ${fill}`}
          style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
        />
      </div>
      <div className="w-20 shrink-0 text-right text-sm tabular-nums">
        {value}
        {share !== null && <span className="ml-1 text-xs text-faint">{share}%</span>}
      </div>
    </Link>
  );
}

function Bar({
  label,
  value,
  pct,
  total,
  tone = "neutral",
}: {
  label: string;
  value: number;
  pct: number;
  total?: number;
  tone?: "neutral" | "positive";
}) {
  const share = total && total > 0 ? Math.round((value / total) * 100) : null;
  const fill =
    tone === "positive"
      ? "bg-gradient-to-r from-emerald-500/60 to-emerald-500/30"
      : "bg-gradient-to-r from-foreground/25 to-foreground/10";
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0 truncate text-sm text-muted">{label}</div>
      <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-surface">
        <div
          className={`h-full rounded-md ${fill}`}
          style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
        />
      </div>
      <div className="w-20 shrink-0 text-right text-sm tabular-nums">
        {value}
        {share !== null && <span className="ml-1 text-xs text-faint">{share}%</span>}
      </div>
    </div>
  );
}
