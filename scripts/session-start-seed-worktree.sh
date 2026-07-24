#!/usr/bin/env bash
# SessionStart hook: seed career-ops worktrees with gitignored user-layer files.
#
# Used by Grok (~/.grok/hooks/) and Claude Code (~/.claude/settings.json).
# Always exits 0 (fail-open) so a bad path never blocks session start.
#
# Reads optional JSON on stdin (cwd / workspaceRoot). Falls back to
# $GROK_WORKSPACE_ROOT / $CLAUDE_PROJECT_DIR / $PWD.

set -u

MAIN="${CAREER_OPS_MAIN:-$HOME/Fun/Productivity/career-ops}"
BOOTSTRAP="$MAIN/scripts/bootstrap-worktree-from-main.mjs"

dest=""
if [ ! -t 0 ]; then
  # Prefer workspaceRoot from hook payload when present
  dest="$(
    python3 -c '
import sys, json
raw = sys.stdin.read()
if not raw.strip():
    raise SystemExit(0)
try:
    d = json.loads(raw)
except Exception:
    raise SystemExit(0)
print(d.get("workspaceRoot") or d.get("cwd") or d.get("workspace_root") or "")
' 2>/dev/null || true
  )"
fi

if [ -z "${dest}" ]; then
  dest="${GROK_WORKSPACE_ROOT:-${CLAUDE_PROJECT_DIR:-$PWD}}"
fi

if [ ! -f "$BOOTSTRAP" ]; then
  exit 0
fi

if [ ! -d "$dest" ]; then
  exit 0
fi

# Fast path: not career-ops
if [ ! -f "$dest/doctor.mjs" ] || [ ! -f "$dest/AGENTS.md" ]; then
  exit 0
fi

# Fast path: already has identity
if [ -f "$dest/cv.md" ] && [ -f "$dest/config/profile.yml" ] && [ -f "$dest/modes/_profile.md" ]; then
  # Still fill any missing context/deps via --auto (cheap no-op if complete)
  :
fi

# Fast path: this IS main
main_real="$(cd "$MAIN" 2>/dev/null && pwd -P || echo "$MAIN")"
dest_real="$(cd "$dest" 2>/dev/null && pwd -P || echo "$dest")"
if [ "$main_real" = "$dest_real" ]; then
  exit 0
fi

# node may be missing in some launchd/minimal PATHs
if ! command -v node >/dev/null 2>&1; then
  # common macOS locations
  export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  exit 0
fi

node "$BOOTSTRAP" --auto --dest "$dest" --main "$MAIN" 2>&1 || true
exit 0
