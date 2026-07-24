#!/usr/bin/env node
/**
 * Seed a career-ops worktree with user-layer files from the main checkout.
 *
 * Enables parallel job applications: each worktree gets identity + context from
 * main, writes its own report/PDF/JD, then merges tracker additions back to main.
 *
 * Usage:
 *   node scripts/bootstrap-worktree-from-main.mjs
 *   node scripts/bootstrap-worktree-from-main.mjs --dest /path/to/worktree
 *   node scripts/bootstrap-worktree-from-main.mjs --main ~/Fun/Productivity/career-ops --dest .
 *   node scripts/bootstrap-worktree-from-main.mjs --force-identity   # overwrite cv/profile/_profile
 *   node scripts/bootstrap-worktree-from-main.mjs --link-deps        # symlink node_modules + fonts
 *   node scripts/bootstrap-worktree-from-main.mjs --json
 *
 * Default --main: ~/Fun/Productivity/career-ops
 * Default --dest: process.cwd()
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_MAIN = path.join(os.homedir(), 'Fun/Productivity/career-ops');

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
    main: DEFAULT_MAIN,
    dest: process.cwd(),
    forceIdentity: false,
    linkDeps: false,
    heavy: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--main') out.main = path.resolve(argv[++i]);
    else if (a === '--dest') out.dest = path.resolve(argv[++i]);
    else if (a === '--force-identity') out.forceIdentity = true;
    else if (a === '--link-deps') out.linkDeps = true;
    else if (a === '--heavy') out.heavy = true;
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
  return force && exists(dest) ? 'overwritten' : 'copied';
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

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/bootstrap-worktree-from-main.mjs [options]

Options:
  --main PATH         Main career-ops checkout (default: ~/Fun/Productivity/career-ops)
  --dest PATH         Worktree to seed (default: cwd)
  --force-identity    Overwrite identity files even if present
  --link-deps         Symlink node_modules and fonts from main
  --heavy             Also copy scan-history.tsv / scan-runs.tsv
  --json              Machine-readable summary
`);
    process.exit(0);
  }

  const mainRoot = path.resolve(opts.main);
  const destRoot = path.resolve(opts.dest);

  if (!exists(mainRoot)) {
    console.error(JSON.stringify({ error: `main checkout not found: ${mainRoot}` }));
    process.exit(1);
  }
  if (path.resolve(mainRoot) === path.resolve(destRoot)) {
    console.error(
      JSON.stringify({
        error: 'dest is the same as main — refusing to bootstrap main onto itself',
        main: mainRoot,
        dest: destRoot,
      }),
    );
    process.exit(1);
  }
  if (!exists(path.join(mainRoot, 'cv.md')) && !exists(path.join(mainRoot, 'config/profile.yml'))) {
    console.error(
      JSON.stringify({
        error: 'main checkout looks unseeded (no cv.md / profile.yml)',
        main: mainRoot,
      }),
    );
    process.exit(1);
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

  // Optional: copy a few recent reports for pattern reference (not full history)
  // — skip; agents can read main reports by absolute path if needed.

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

  // Marker so agents know this worktree was seeded and where main lives
  const marker = {
    seededAt: new Date().toISOString(),
    main: mainRoot,
    dest: destRoot,
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

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Seeded worktree from main\n  main: ${mainRoot}\n  dest: ${destRoot}\n`);
    for (const r of results) {
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
}

main();
