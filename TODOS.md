# TODOS

Priority reference:
- **P0** — ship blocker, production bug, data loss risk
- **P1** — important, do next sprint
- **P2** — nice to have
- **P3** — backlog
- **P4** — someday/maybe

Format contract (parsed by `scripts/next_todo.py` — the deterministic selector behind
`/next-todo` and `scripts/loop_next_todo.sh`):
- `## ` headings are SECTIONS (grouping only); each tracked item is a `### ` heading
  with a `**Priority:** P0..P4` line in its body.
- A hard dependency is a `**Depends on:** …` line → the item buckets BLOCKED until met;
  `**Depends on:** none (…)` / `n/a` means no real dependency → READY.
- `trigger-gated` or `SHELVED` on the title/Priority line → PARKED (never auto-picked).
- Closed items: strike the title (`### ~~Title~~ — DONE`) or add a `**Completed:**` line.
- Avoid standalone full-line `**bold**` lines inside a body — the parser treats them as
  new item titles and truncates the previous item's body there (labelled lines like
  `**Why:** …` are safe).

---

## Backlog

### Patch the js-yaml moderate DoS (GHSA-h67p-54hq-rp68) by raising the floor to ^4.1.2
**Priority:** P1 | **Effort:** S
**Depends on:** none

**What:** `npm audit --audit-level=moderate` is RED today: `js-yaml` 4.1.1 is installed and the
advisory's vulnerable range is `>=4.0.0 <=4.1.1` (quadratic-complexity DoS in merge-key handling
via repeated aliases). `package.json` pins `"js-yaml": "^4.1.1"`, and BOTH lockfiles are
gitignored in this fork (`package-lock.json`, `bun.lock`), so a bare `npm audit fix` leaves no
committable trace and the next fresh install can regress. Raise the floor in `package.json` to
`"js-yaml": "^4.1.2"`, run `npm install`, re-run the audit.

**Done when:** `npm audit --audit-level=moderate` exits 0, the landing commit's
`git diff --name-only` lists only `package.json`, and `npm test` (test-all.mjs --quick,
1536 checks) stays green.

**Why:** direct dependency; career-ops parses YAML it reads from disk (`portals.yml`,
`config/profile.yml`, `templates/*.yml`), so a crafted merge-key alias chain is a real DoS
surface. = MAINTENANCE_GOALS.md goal M1 (rank 1, open since the 2026-06-30 scan) — when this
lands, flip M1 to done there (Summary row + goal comment + checkbox) so the two backlogs
don't drift.

### Stop the Release Please red-X that fires on every push to main
**Priority:** P2 | **Effort:** S
**Depends on:** none

**What:** `.github/workflows/release.yml` (upstream's release automation) fails in ~7s on every
push to main: `release-please failed: base (tonyjzhou/career-ops): Missing required manifest
config: release-please-config.json` — the fork tracks `.release-please-manifest.json` but not
upstream's `release-please-config.json`, and this fork never cuts releases or publishes the
scaffolder anyway. Recommended fix: `gh workflow disable "Release Please"` — a GitHub-side
switch that needs NO tree change and survives `node update-system.mjs apply` (which restores
`.github/`, a system path, from upstream — deleting release.yml alone would be resurrected by
the next system update). Document the disable in a short commit (e.g. a one-line note in this
ticket's strike).

**Done when:** `gh workflow view "Release Please"` reports the workflow disabled
(disabled_manually), and the next push to main triggers no Release Please run
(`gh run list` shows only CodeQL / Web CI / no-user-data for that push).

**Why:** a red X on every push trains the operator to ignore CI, hiding a real future failure;
the other workflows (CodeQL, Web CI) are green and still provide signal. Solo fork — no
release pipeline is wanted here (global rule: remove/disable CI ceremony on solo repos rather
than fix an unwanted pipeline).

### Re-add the local loop-port edits (CLAUDE.md section + USER_PATHS entries) after the next system update
**Priority:** P3 (trigger-gated: fire on the next `node update-system.mjs apply` — until an update actually runs there is nothing to re-add)
**Depends on:** none

**What:** two loop-port (2026-07-12) edits live in system-layer files that `update-system.mjs
apply` overwrites wholesale from upstream, and the next system update will silently drop both:
(1) the "Backlog drain loop" section at the end of CLAUDE.md, and (2) the three fork-local
USER_PATHS entries in update-system.mjs (`TODOS.md`, `Makefile`, `scripts/` — without them
`node validate-system-paths-coverage.mjs` goes red, failing `npm test`). After the next apply,
re-apply both (CLAUDE.md section below the `@AGENTS.md` include; USER_PATHS lines beside the
existing fork-local `MAINTENANCE_GOALS.md` entry), or better: teach the update flow to preserve
registered local edits in a small post-apply step.

**Done when:** after an actual `update-system.mjs apply`, `grep -q 'Backlog drain loop' CLAUDE.md`
succeeds, `node validate-system-paths-coverage.mjs` exits 0, and the re-add is committed
alongside (or immediately after) the update commit.

**Why:** the drain loop's discoverability doc and the repo's own tracked-file coverage gate both
sit in files this repo auto-updates; without a re-add ritual the loop loses its docs and
`npm test` goes red on the first post-update run. `.claude/skills/next-todo/SKILL.md`,
`tests/scripts/`, and the `scripts/` files themselves are safe (the update's `git checkout` of
upstream paths never deletes extra local files) — only these two in-file edits need the ritual.
