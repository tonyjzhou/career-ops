#!/usr/bin/env node
/**
 * Seed a career-ops worktree / secondary checkout with user-layer files from main.
 *
 * Gitignored identity (cv.md, profile, tracker, …) is not in the repo, so bare
 * worktrees and Grok clones under ~/.grok/worktrees/ start "empty." This script
 * copies those files from the canonical main checkout.
 *
 * Usage:
 *   node scripts/bootstrap-worktree-from-main.mjs
 *   node scripts/bootstrap-worktree-from-main.mjs --dest /path/to/worktree
 *   node scripts/bootstrap-worktree-from-main.mjs --main ~/Fun/Productivity/career-ops --dest .
 *   node scripts/bootstrap-worktree-from-main.mjs --force-identity   # overwrite cv/profile/_profile
 *   node scripts/bootstrap-worktree-from-main.mjs --link-deps        # symlink node_modules + fonts
 *   node scripts/bootstrap-worktree-from-main.mjs --auto             # SessionStart: no-op unless needed
 *   node scripts/bootstrap-worktree-from-main.mjs --json
 *
 * Default --main: $CAREER_OPS_MAIN or ~/Fun/Productivity/career-ops
 * Default --dest: process.cwd()
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_MAIN = process.env.CAREER_OPS_MAIN
  ? path.resolve(process.env.CAREER_OPS_MAIN)
  : path.join(os.homedir(), 'Fun/Productivity/career-ops');

/** Identity / personalization — safe to re-copy when missing; needed for CV/eval. */
const IDENTITY_FILES = [
  'cv.md',
  'article-digest.md',
  'voice-dna.md',
  'portals.yml',
  'config/profile.yml',
  'config/cv-facts.json',
  'config/plugins.yml',
  'config/benchmarks.yml',
  'modes/_profile.md',
  'modes/_custom.md',
  'interview-prep/story-bank.md',
  'data/blacklist.md',
];

/**
 * Shared operational context — snapshot for scoring/dedup.
 * Worktree must not treat these as the only write target; merge back to main.
 */
const CONTEXT_FILES = [
  'data/applications.md',
  'data/follow-ups.md',
  'data/pipeline.md',
  'data/blockers.md',
  'data/pdf-index.tsv',
  'data/salary-observations.tsv',
  'data/assessments.tsv',
  'data/status-log.tsv',
];

/** Optional heavy context (skip if huge / not needed for a single apply). */
const OPTIONAL_HEAVY = [
  'data/scan-history.tsv',
  'data/scan-runs.tsv',
];

const ENSURE_DIRS = [
  'data',
  'config',
  'modes',
  'reports',
  'output',
  'jds',
  'batch/tracker-additions',
  'interview-prep',
  'writing-samples',
];

function parseArgs(argv) {
  const out = {
    main: null, // resolved later
    dest: process.cwd(),
    forceIdentity: false,
    linkDeps: false,
    heavy: false,
    auto: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--main') out.main = path.resolve(argv[++i]);
    else if (a === '--dest') out.dest = path.resolve(argv[++i]);
    else if (a === '--force-identity') out.forceIdentity = true;
    else if (a === '--link-deps') out.linkDeps = true;
    else if (a === '--heavy') out.heavy = true;
    else if (a === '--auto') out.auto = true;
    else if (a === '--json') out.json = true;
    else if (a === '-h' || a === '--help') out.help = true;
  }
  return out;
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isCareerOpsRoot(dir) {
  // Lightweight markers present in every career-ops checkout (tracked files).
  return exists(path.join(dir, 'doctor.mjs')) && exists(path.join(dir, 'AGENTS.md'));
}

function looksLikeCareerOpsRemote(dir) {
  try {
    const remote = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /career-ops/i.test(remote);
  } catch {
    return false;
  }
}

/**
 * If dest is a linked git worktree of career-ops, prefer the worktree that
 * actually holds user-layer files (usually the primary checkout).
 */
function discoverMainFromGit(destRoot) {
  try {
    const list = execFileSync('git', ['-C', destRoot, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const paths = [];
    for (const line of list.split('\n')) {
      if (line.startsWith('worktree ')) paths.push(line.slice('worktree '.length).trim());
    }
    for (const p of paths) {
      if (path.resolve(p) === path.resolve(destRoot)) continue;
      if (exists(path.join(p, 'cv.md')) || exists(path.join(p, 'config/profile.yml'))) {
        return path.resolve(p);
      }
    }
  } catch {
    /* not a git repo or no worktrees */
  }
  return null;
}

function resolveMain(destRoot, explicitMain) {
  if (explicitMain) return path.resolve(explicitMain);
  const fromGit = discoverMainFromGit(destRoot);
  if (fromGit) return fromGit;
  if (exists(DEFAULT_MAIN) && isCareerOpsRoot(DEFAULT_MAIN)) return DEFAULT_MAIN;
  return DEFAULT_MAIN;
}

/** True when main has a file that dest is still missing (or force). */
function needsSeed(mainRoot, destRoot, { forceIdentity = false } = {}) {
  if (forceIdentity) return true;
  for (const rel of [...IDENTITY_FILES, ...CONTEXT_FILES]) {
    if (exists(path.join(mainRoot, rel)) && !exists(path.join(destRoot, rel))) return true;
  }
  // deps: missing node_modules while main has it
  if (exists(path.join(mainRoot, 'node_modules')) && !exists(path.join(destRoot, 'node_modules'))) {
    return true;
  }
  return false;
}

/**
 * Copy file if source exists and dest is missing (or force).
 * Returns: 'copied' | 'skipped-exists' | 'skipped-no-source' | 'overwritten'
 */
function seedFile(srcRoot, destRoot, rel, { force = false } = {}) {
  const src = path.join(srcRoot, rel);
  const dest = path.join(destRoot, rel);
  if (!exists(src)) return 'skipped-no-source';
  if (exists(dest) && !force) return 'skipped-exists';
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return force ? 'overwritten' : 'copied';
}

function linkIfMissing(srcRoot, destRoot, rel) {
  const src = path.join(srcRoot, rel);
  const dest = path.join(destRoot, rel);
  if (!exists(src)) return 'skipped-no-source';
  if (exists(dest)) {
    try {
      const st = fs.lstatSync(dest);
      if (st.isSymbolicLink()) return 'skipped-exists';
    } catch {
      /* continue */
    }
    return 'skipped-exists';
  }
  ensureDir(path.dirname(dest));
  fs.symlinkSync(src, dest, 'dir');
  return 'linked';
}

function emit(summary, { json, quiet }) {
  if (quiet && !json) return;
  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  if (summary.skipped) {
    console.log(summary.reason || 'skipped');
    return;
  }
  console.log(`Seeded worktree from main\n  main: ${summary.main}\n  dest: ${summary.dest}\n`);
  for (const r of summary.results || []) {
    if (r.action === 'skipped-no-source') continue;
    console.log(`  [${r.action}] ${r.rel}`);
  }
  console.log(`\nCopied/linked: ${summary.copied}  already present: ${summary.skippedExists}`);
  console.log('\nMerge back when done:');
  console.log('  1. Copy new reports/*.md → main/reports/');
  console.log('  2. Copy batch/tracker-additions/*.tsv → main/batch/tracker-additions/');
  console.log('  3. On main: node merge-tracker.mjs');
  console.log('  4. Optionally copy output/*.pdf → main/output/');
}

function runSeed(opts) {
  const destRoot = path.resolve(opts.dest);
  const mainRoot = resolveMain(destRoot, opts.main);

  // --auto: silent no-ops for non-career-ops, main checkout, or already seeded
  if (opts.auto) {
    if (!isCareerOpsRoot(destRoot) && !looksLikeCareerOpsRemote(destRoot)) {
      emit({ ok: true, skipped: true, reason: 'not career-ops' }, { json: opts.json, quiet: true });
      return 0;
    }
    if (path.resolve(mainRoot) === path.resolve(destRoot)) {
      emit({ ok: true, skipped: true, reason: 'dest is main' }, { json: opts.json, quiet: true });
      return 0;
    }
    if (!exists(mainRoot) || (!exists(path.join(mainRoot, 'cv.md')) && !exists(path.join(mainRoot, 'config/profile.yml')))) {
      // Fail open for SessionStart — don't break non-career or misconfigured envs
      emit(
        { ok: true, skipped: true, reason: `main unavailable or unseeded: ${mainRoot}` },
        { json: opts.json, quiet: true },
      );
      return 0;
    }
    if (!needsSeed(mainRoot, destRoot, { forceIdentity: opts.forceIdentity })) {
      emit({ ok: true, skipped: true, reason: 'already seeded', main: mainRoot, dest: destRoot }, {
        json: opts.json,
        quiet: true,
      });
      return 0;
    }
    // Auto always links deps when seeding a fresh worktree
    opts.linkDeps = true;
  }

  if (!exists(mainRoot)) {
    console.error(JSON.stringify({ error: `main checkout not found: ${mainRoot}` }));
    return opts.auto ? 0 : 1;
  }
  if (path.resolve(mainRoot) === path.resolve(destRoot)) {
    if (opts.auto) {
      emit({ ok: true, skipped: true, reason: 'dest is main' }, { json: opts.json, quiet: true });
      return 0;
    }
    console.error(
      JSON.stringify({
        error: 'dest is the same as main — refusing to bootstrap main onto itself',
        main: mainRoot,
        dest: destRoot,
      }),
    );
    return 1;
  }
  if (!exists(path.join(mainRoot, 'cv.md')) && !exists(path.join(mainRoot, 'config/profile.yml'))) {
    if (opts.auto) {
      emit({ ok: true, skipped: true, reason: 'main unseeded' }, { json: opts.json, quiet: true });
      return 0;
    }
    console.error(
      JSON.stringify({
        error: 'main checkout looks unseeded (no cv.md / profile.yml)',
        main: mainRoot,
      }),
    );
    return 1;
  }

  for (const d of ENSURE_DIRS) ensureDir(path.join(destRoot, d));

  const results = [];

  for (const rel of IDENTITY_FILES) {
    const action = seedFile(mainRoot, destRoot, rel, { force: opts.forceIdentity });
    results.push({ rel, layer: 'identity', action });
  }

  for (const rel of CONTEXT_FILES) {
    const action = seedFile(mainRoot, destRoot, rel, { force: false });
    results.push({ rel, layer: 'context', action });
  }

  if (opts.heavy) {
    for (const rel of OPTIONAL_HEAVY) {
      const action = seedFile(mainRoot, destRoot, rel, { force: false });
      results.push({ rel, layer: 'heavy', action });
    }
  }

  if (opts.linkDeps) {
    for (const rel of ['node_modules', 'fonts']) {
      const action = linkIfMissing(mainRoot, destRoot, rel);
      results.push({ rel, layer: 'deps', action });
    }
  } else if (!exists(path.join(destRoot, 'node_modules'))) {
    results.push({
      rel: 'node_modules',
      layer: 'deps',
      action: 'missing',
      hint: 'run npm install in worktree, or re-run with --link-deps',
    });
  }

  const marker = {
    seededAt: new Date().toISOString(),
    main: mainRoot,
    dest: destRoot,
    auto: Boolean(opts.auto),
    note:
      'User-layer seeded from main. Write reports/output/jds locally; merge tracker TSVs back to main via batch/tracker-additions + merge-tracker.mjs on main.',
  };
  fs.writeFileSync(path.join(destRoot, 'data/.worktree-seed.json'), JSON.stringify(marker, null, 2) + '\n');

  const summary = {
    ok: true,
    main: mainRoot,
    dest: destRoot,
    copied: results.filter((r) => r.action === 'copied' || r.action === 'overwritten' || r.action === 'linked')
      .length,
    skippedExists: results.filter((r) => r.action === 'skipped-exists').length,
    skippedNoSource: results.filter((r) => r.action === 'skipped-no-source').length,
    results,
    mergeBack: {
      reports: 'cp reports/{num}-*.md → main/reports/',
      trackerTsv: 'cp batch/tracker-additions/*.tsv → main/batch/tracker-additions/ then node merge-tracker.mjs on main',
      pdf: 'cp output/*.pdf → main/output/ (optional)',
    },
  };

  // In --auto, always print a one-line notice so SessionStart leaves a breadcrumb
  if (opts.auto && !opts.json) {
    console.error(
      `[career-ops] seeded user-layer from main → ${destRoot} (${summary.copied} files/links)`,
    );
  }
  emit(summary, { json: opts.json, quiet: opts.auto && !opts.json });
  return 0;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/bootstrap-worktree-from-main.mjs [options]

Options:
  --main PATH         Main career-ops checkout (default: $CAREER_OPS_MAIN or ~/Fun/Productivity/career-ops)
  --dest PATH         Worktree to seed (default: cwd)
  --force-identity    Overwrite identity files even if present
  --link-deps         Symlink node_modules and fonts from main
  --auto              SessionStart mode: no-op unless this is a career-ops secondary checkout missing user-layer files; implies --link-deps when seeding
  --heavy             Also copy scan-history.tsv / scan-runs.tsv
  --json              Machine-readable summary
`);
    process.exit(0);
  }

  process.exit(runSeed(opts));
}

main();
