# Changelog

All notable changes to Hone are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- **Classifier ignored a closing instruction after a leading question.** The
  imperative/interrogative checks were `^`-anchored to the whole prompt, so
  "why does this deadlock? just add a timeout for now" scored as pure learning
  and opened the gate — even though the user had already decided. A decisive
  closing clause ("just add X", "go ahead and Y") is now a strong execution
  signal and cancels the "this is a question" bonus. On the held-out set this is
  0% false-coach with ~92% recall.
- **A rubber-stamp gate reply was credited as independent work.** `independent`
  was computed purely from the configured hint level, and `markAnswered()`
  accepted any next prompt — so at the shipped hint-0 default a one-word "ok"
  recorded an independent rep and moved proficiency toward permanent graduation
  (a proficiency-gaming hole; Baker et al. 2004; Neagu et al. 2026). The gate
  still opens on any reply, but the skill-profile *write* now requires a
  substantive answer (`isSubstantiveAnswer`); a terse but real approach still
  counts.
- **Graduation was a permanent badge (irreversible-graduation bug).** Idle
  decay was capped at 15 points, exactly `100 − GRADUATE_PROFICIENCY(85)`, so a
  category that ever hit proficiency 100 could never decay below the graduation
  bar — `graduated()` stayed true forever, contradicting the code's own "so
  graduation is reversible" comment. The decay cap is now 40, so even a
  fully-mastered skill falls out of graduation after enough idle weeks (the
  neutral-baseline floor still bounds it).
- **`always_coach` was silently overridden by graduation.** `budget.decide()`
  returned `graduated-independent` *before* it checked whether the category was
  pinned to `always_coach`, so a category the user explicitly asked to always
  coach (e.g. `security`) stopped gating the moment it graduated. The pin is now
  checked first and outranks auto-graduation.
- **`/hone:off` → `/hone:on` stale-gate hijack.** `setEnabled()` only ever
  wrote `state.json`; it never touched session state, so a Solution Gate left
  `pending` at the moment of `/hone:off` survived the round trip. The next
  prompt after `/hone:on` — however unrelated to the original coached task —
  was silently treated as "the answer" to that stale gate: marked answered,
  coached on a category the user wasn't thinking about, and logged a skill
  signal off zero relevant input. `/hone:off` now resets a still-open gate for
  the current session to `idle` (new `gate.reset()`) before writing the
  runtime toggle, so `/hone:on` always starts clean. This landed right on the
  exact self-help action (disable, then re-enable) a frustrated user is most
  likely to take.

### Changed
- **Proficiency now uses Bayesian Knowledge Tracing, not a flat ±6 nudge.** A
  principled belief update (Corbett & Anderson 1994) with fixed guess/slip/
  transit parameters — fixed rather than per-user-fit because per-category
  events are far too sparse to fit (Pradhan et al. 2026). The working
  probability is clamped off 0/1 before the Bayes step to avoid the absorbing
  state at p=1 that would freeze a maxed skill (Beck & Chang 2007) — an assisted
  rep now lowers proficiency even from 100.
- **Grace-skip reserve.** The first couple of `/hone:skip` uses per category are
  penalty-free — an occasional escape hatch isn't deskilling (Sharif & Shu 2017
  on capped "emergency reserves"; Lally et al. 2010 on missed reps not derailing
  habits). Past the reserve, a skip is an assisted signal as before.
- **Held-out classifier eval + honest accuracy claim.** Added a 30-prompt
  held-out set written after the signals were frozen and never used to tune
  them; the README now cites its numbers (0% false-coach, ~92% recall) instead
  of the iteratively-tuned in-repo sets.
- **Cold-start guidance instead of hint-0 for unknown topics.** Minimal-guidance
  coaching is the wrong default for a topic the user has never worked — worked
  examples beat unguided problem-solving for novices (Kirschner, Sweller & Clark
  2006; Kalyuga's expertise-reversal effect), and a 2026 CHIWORK RCT found a
  "guided hints" condition produced the largest learning gains *and* the lowest
  frustration of every condition tested. A category with no track record is now
  floored at hint level 2 ("high-level ideas") for its first few coached tasks,
  then relaxes to the user's dial. The floor only *raises* a lower setting; it
  never overrides a higher one.
- **Debugging is carved out both ways.** It is the skill most damaged by AI
  assistance and the one where pure question-asking won (Shen & Tamkin 2026,
  arXiv:2601.20245), so it keeps its hint-0 cold start (no floor), holds a lower
  coaching ceiling (never past "high-level ideas"), and needs 12 reps to
  graduate instead of 8. `/hone:skip` and `/hone:hint 5` still bypass coaching
  entirely.
- **Onboarding coaching-rate ramp.** A brand-new install no longer opens at the
  full (default 100%) coaching rate — front-loaded friction is what gets a tool
  uninstalled before it proves itself. The effective learning budget is capped
  at 50% for a user's first ~5 eligible tasks, then the real budget takes over.
  New `onboarding` setting (default `true`; set `false` to disable).
- **Autonomy-supportive Solution Gate copy.** A hard PreToolUse deny is
  need-thwarting, not merely unsupportive (Bartholomew et al. 2011), so the
  gate and deny-reason copy now lead with a *rationale* ("putting your own
  approach into words first is what keeps the skill yours"), drop the scolding
  tone, and present `/hone:skip` as a first-class choice rather than a grudging
  afterthought. Deci, Eghrari, Patrick & Leone (1994) found that pairing an
  imposed task with a rationale, an acknowledgement of the friction, and
  choice-framed language is what makes it get internalized instead of resented.
  Behavior is unchanged — same gate, same ≤3 questions; only the framing moved.
- **Coaching now consolidates before it critiques.** Productive failure only
  pays off when the struggle is *resolved* with explicit consolidation; without
  it, withholding is indistinguishable from spoon-feeding (Kapur's
  "unproductive failure"; Sinha & Kapur 2021, *Review of Educational Research*,
  d = 0.36). Both the post-gate coaching prompt and the auto-feedback review now
  require a plain up-front verdict — *right / partially right / wrong*, naming
  what is genuinely sound — before any critique. `skills/socratic-review`
  rule 3 gets the same requirement.

### Added
- **`/hone:budget <0-100>`** and **`/hone:reflection <off|optional|on>`** —
  in-chat de-escalation levers for the learning budget and reflection recap,
  mirroring the existing `/hone:hint` runtime-override pattern (take effect
  immediately, no `config.yaml` editing required). Previously `/hone:off` was
  the only in-chat lever between "tolerate everything" and "disable
  entirely"; `RuntimeState` gains `learning_budget` and `reflection`, and
  `config.effective()` now applies the same runtime-overrides-config
  precedence to them that `hint_level` already had. `/hone:status` now also
  reports the current reflection mode.

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
