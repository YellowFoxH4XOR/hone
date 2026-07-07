# Changelog

All notable changes to Hone are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [0.4.0] — 2026-07-07

Stage 2 — the loop closes: the skill profile now feeds back into how much Hone
coaches, misclassifications become training data, and two new surfaces
(interview mode, dashboard) put the profile to work.

### Added
- **Progressive independence (F9)** — a category with proficiency ≥85 across
  ≥8 coached reps *graduates* and stops gating (still counted eligible, so the
  stats stay honest). Proficiency decays 1 point per idle week (capped at 15)
  so a stale graduation re-enters coaching naturally. New `progressive` config
  key (default on); `/hone:status` shows a 🎓 marker.
- **`/hone:wrong [note]`** — report a misclassification. Appends the last
  routed prompt to `~/.claude/hone/misclassifications.jsonl` (your real-world
  labeled set for classifier tuning) and, if the mistake is currently gating
  you, unblocks WITHOUT the proficiency penalty a skip costs. Works in both
  directions: false-coach and missed-learning.
- **Interview mode (F10)** — `/hone:interview [topic]` flips the session:
  Claude interviews you (explain code, defend decisions, walk failure modes),
  one question at a time, file edits blocked, until `/hone:interview stop`.
- **Local dashboard** — `/hone:dashboard` starts a zero-dependency server on
  `127.0.0.1` (config `dashboard.port`, default 4173) rendering the skill
  profile, counters, and graduation status live. `/hone:dashboard stop` ends it.

### Changed
- Hooks now record the last routed classification per session (powers
  `/hone:wrong`).
- Profile counters grew `corrections` and `interviews`.

## [0.3.0] — 2026-07-07

Assertive defaults. Hone now leans into the learning hypothesis out of the box:
if the gate never fires, the product never gets tested. Everything remains
user-configurable — dial it down in `~/.claude/hone/config.yaml` if it's too much.

### Changed
- **`learning_budget` default: 20 → 100.** Every eligible learning task is
  coached by default. The exact deterministic ratio still applies at any lower
  setting.
- **`hint_level` default: 1 → 0.** Questions-only coaching by default — the
  level that forces the most thinking. The 0–5 dial is unchanged.
- **`reflection` default: `optional` → `on`.** The once-per-session recap after
  coached work is now asked plainly instead of framed as skippable; set
  `optional` or `off` to soften it. `/hone:skip` remains available on every
  gated task — the escape hatch is untouched.
- Malformed/missing config values now fall back to the new defaults
  (budget 100, hint 0) instead of the old ones.
- Existing users' `config.yaml` files are untouched — explicit settings always
  win over defaults; only fresh installs (or deleted configs) get the new
  behavior.

## [0.2.0] — 2026-07-07

Stage 1 — coaching beyond the gate. All additive; existing behavior and the
exact learning-budget guarantee are unchanged.

### Added
- **Auto-feedback (F5)** — a new `PostToolUse` hook gives a short senior-lens
  review of code written during a coached task (edge cases, failure modes, one
  thing to check). Fires once per coached task, respects `review_only`, and is
  silent on ordinary uncoached work. New `autofeedback` config key (default on).
- **Reflection (F6)** — the `Stop` hook now invites a short recap once per
  coached session ("what was hardest? explain it back without looking"). Always
  optional; controlled by the existing `reflection` key.
- **Skill profile & adaptive coaching (F7)** — a per-category proficiency
  profile (a directional behavioral signal, not a graded score) that rises when
  you engage a gate at a low hint level and falls when you skip or lean on full
  solutions. With the new `adaptive` key (default on), weak areas get more
  Socratic questioning and bypass the budget while strong areas get more direct
  help. A no-op at neutral proficiency, so the exact-budget guarantee holds
  until real signal accumulates. Rendered in `/hone:status`.

### Changed
- Profile schema bumped to v2 (`counters.reflections`, `skills`). Older profiles
  self-heal on load; no migration needed.
- Default `never_coach` is now empty (execution categories were never coached
  regardless; the old default was inert).

## [0.1.0] — 2026-07-07

Stage 0 — the wedge.

### Added
- **Intent router + learning budget (F1)** — classifies each prompt; coaches a
  configurable, deterministic share of eligible learning tasks (default 20%).
- **Solution Gate (F2)** — blocks file edits on a coached task until you share
  your approach; `/hone:skip` always bypasses.
- **Hint levels (F3)** — 0 (questions only) … 5 (full implementation).
- **Socratic reviews (F4)** — a coaching output style and skill.
- `/hone:status | on | off | hint N | skip` commands, an opt-in statusline,
  and local-first JSON state under `~/.claude/hone/`.
