---
name: next-todo
description: >
  Pick up the next-highest-priority, dependency-free item in TODOS.md and drive it end to end, then
  close it out. Invoke on "work the next todo", "pick up the next item", "what should I work on
  next", "next backlog item", "drain TODOS", or "/next-todo". This is the CAREER-OPS specialization
  of the generic /next-todo (at ~/.claude/skills/next-todo/SKILL.md): same select → judgment →
  Track A/B → /goalify → build → verify → review → land (direct commit to main, no PR) →
  strike-DONE loop, with this repo's verify/build/land specifics layered on. Feeds every new review
  finding back into TODOS.md via /todoify. Do NOT invoke to land an already-built change (that is
  /git-triage) or to author a ticket (that is /todoify); it CHOOSES the item and orchestrates the
  named skills.
---

# Work the next backlog item, end to end — Career-Ops deltas

**Read the generic skill first:** `~/.claude/skills/next-todo/SKILL.md` owns the core loop (Step 1
select → Step 2 judgment → Step 3 Track A/B → Step 4 pipeline → Step 5 close → loop → traps). This
file only carries what is specific to **career-ops** — apply these on top. The headless rules below
were earned in value-hunt's drain history (17+ no-land root causes); they are inherited doctrine,
not speculation.

## Step 0 — Repo shape (read before touching anything)

- **Two layers (CLAUDE.md Data Contract — CRITICAL).** USER layer (`cv.md`, `config/profile.yml`,
  `portals.yml`, `modes/_profile.md`, `modes/_custom.md`, `data/*`, `reports/*`, `output/*`,
  `interview-prep/*`) is the operator's personal data — a loop pass must NEVER write it. Backlog
  work targets the SYSTEM layer (`*.mjs`, `templates/`, `dashboard/`, `docs/`) and local tooling
  (`scripts/`, `tests/scripts/`, `Makefile`, `TODOS.md`).
- **This is a FORK of upstream santifer/career-ops.** `update-system.mjs apply` overwrites
  system-layer files (including CLAUDE.md and `.github/`) wholesale from upstream. Prefer minimal,
  surgical diffs to upstream-managed files; local-only files (`scripts/loop_*`, `TODOS.md`,
  `Makefile`, this skill) are safe.
- **Personal-data guard:** `test-all.mjs` git-greps TRACKED files for leak patterns (emails,
  domains, names). Never introduce personal data — or the upstream author's domain — into a
  tracked file; keep it in the gitignored user layer.

## Step 1 — Select

This repo ships its own `scripts/next_todo.py`, so the generic selector's fallback uses it
automatically:
```bash
python3 scripts/next_todo.py          # human buckets: READY / BLOCKED / PARKED
python3 scripts/next_todo.py --json   # machine-readable; .next is the default pick
```
The TODOS.md grammar contract is at the top of TODOS.md itself.

## Step 2 — Judgment

- **Park-on-decline = write it back, verify, direct to main, SAME pass.** When you decline the top
  READY pick as deferred (only after confirming no *wanted* slice is buildable today), add a literal
  `**Depends on:** …` line (buckets the row BLOCKED) or append
  `(trigger-gated: … — <one-line reason>)` to its `**Priority:**` line (buckets it PARKED), commit
  straight to `main` as a one-line `docs(todos):` edit — no branch, no PR — then **re-run
  `python3 scripts/next_todo.py` and confirm the row moved buckets** before touching the next item.
  A headless pass has no callback: an unwritten or unverified decline is re-offered next pass and
  spins the loop.

## Step 3 — Track examples

- **Track A (invent):** a new pipeline subsystem (a new `*.mjs` script family, a new scanner
  provider, a dashboard feature). Shape first (`/office-hours` → optionally `/spec` / `/ap`).
- **Track B (finish):** dependency bumps, CI hygiene, audit fixes, test-coverage gaps, docs sync.
  Skip shaping — proceed.
- **Headless Track-A decision-fork → BUILD-your-recommendation or PARK, NEVER escalate-and-stop.**
  A headless `claude -p` pass has no `AskUserQuestion` and no operator to reply, so an A/B/C
  decision-brief is a DEAD STOP: the turn ends with no commit and every other READY item idles
  behind the pick. If you have a confident default ("(A) … my recommendation"), TAKE IT and build
  end-to-end this pass. Only if you genuinely cannot choose alone, PARK it exactly like
  Park-on-decline (preserve the shaping brief in the item body, park marker on the Priority line,
  `docs(todos):` commit to main, re-run the selector to confirm PARKED). An *interactive* session
  does the opposite — ask, get the decision, then build.

## Step 4 — Pipeline deltas (verify · build · land)

- **Verify is type-specific, not "tests pass":**
  - Anything touching `*.mjs` / `templates/` / pipeline scripts → `npm test`
    (`node test-all.mjs --quick`, 1536 checks, ~20s, GREEN baseline — keep it green). Full suite:
    `npm run test:full`. Scoped: `node test-all.mjs --only <substring>` (discovered
    `tests/**/*.test.mjs` only — inline root-level checks are skipped, so prefer full `npm test`
    as the gate).
  - There is NO build step (plain node .mjs, no bundler). Dashboard (Go) touched →
    `cd dashboard && go build ./...`. `web/` touched → its own Web CI checks.
  - `node verify-pipeline.mjs` / `doctor.mjs` read the gitignored USER layer — on a dev checkout
    they may warn about missing personal data; that is not a regression.
  - Loop harness (`scripts/*.py`, `scripts/loop_*.sh`, `tests/scripts/`) → `make loop-test`
    (pytest, 294 tests, ~25s).
- **Review → feed-back:** `/code-review` (or `/fr` for a large vertical). Append every deferred P#
  finding back into TODOS.md via **`/todoify`**.
- **Land — DIRECT TO MAIN, no PR (solo fork).** Commit + push straight to `main`: no feature
  branch, no PR wait, no CI gate (GitHub workflows are upstream's; the local gate is `npm test`).
  Always push right after committing; if the push is rejected because the remote moved,
  `git pull --rebase && git push`.
- **Do NOT bump VERSION or edit CHANGELOG.md.** Both track the UPSTREAM release stream
  (release-please + `update-system.mjs`, which compares local VERSION against upstream's to detect
  updates) — a local bump breaks update detection. This is the OPPOSITE of the value-hunt/vid-sift
  convention; the commit message + Gate trailer are the audit trail here.
- **Gate trailer — persist the item's check on the landing commit.** Add a commit trailer
  `Gate: <one cheap deterministic shell command>` carrying the item's completion check, e.g.
  `Gate: npm test` or `Gate: npm audit --audit-level=moderate` or
  `Gate: python3 -m pytest tests/scripts -q`. Constraints: a single command, runnable from the
  repo root, no live-service or user-layer-data dependency, <~2 min, never a slash-command.
  PREFER a gate already written on the TODOS ticket (an outside-authored oracle) over one you
  authored this pass. `loop_next_todo.sh` re-runs the trailer after the landing: red → the run
  stops loudly as `gate-fail`. Docs-only commits are exempt.
- **Headless no-yield guard — ALL phases.** Inside `scripts/loop_next_todo.sh` you are a headless
  `claude -p` pass with NO turn continuation and NO background-job completion callback — at any
  phase. **NEVER end your turn while work you intend to finish is pending, and NEVER launch a
  `run_in_background` job and yield expecting to be re-invoked** — the callback never comes, the
  session ends, and the job is killed. This applies to investigation/verification probes as much
  as builds and lands: run EVERY long step synchronously/foreground within the SAME turn. The
  structural backstops (the Stop hook, the dirty-tree `abandoned` stop, the `stalled` classifier +
  auto-park) name the failure — they don't un-abandon the turn.

## Step 5 — Close (career-ops convention)

Strike with date: `### ~~<title>~~ — DONE (YYYY-MM-DD)` (no VERSION exists to cite — see the
no-bump rule above). If the ticket mirrors a MAINTENANCE_GOALS.md goal (marked `= M<n>` in its
body), flip that goal's status to done there in the SAME commit (Summary row + goal comment +
checkbox) so the two backlogs don't drift. Confirm new review findings landed as TODOS entries
via /todoify.
