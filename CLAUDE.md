# Career-Ops — Claude Code

All project rules, data contract, onboarding, modes, pipeline integrity, ethical-use guardrails, offer-verification policy, and canonical states live in `AGENTS.md`. Read it first.

@AGENTS.md

## Claude Code-specific notes

- **Slash commands:** `/career-ops`, `/career-ops pipeline|oferta|ofertas|contacto|deep|pdf|latex|training|project|tracker|apply|scan|batch|patterns|followup`. Defined in `.claude/skills/career-ops/SKILL.md` (shared with OpenCode and Gemini CLI mode files).
- **Headless batch workers:** invoke as `claude -p "prompt"`. Playwright is unavailable in this mode — see the Offer Verification section of `AGENTS.md` for the WebFetch fallback and required `**Verification:** unconfirmed (batch mode)` header marker.
- **Recurring scans:** if the `/loop` or `/schedule` skill is available, prefer those for "scan every N days"; otherwise fall back to cron.

<!-- Add anything Claude Code specific that other agents don't need here. -->
