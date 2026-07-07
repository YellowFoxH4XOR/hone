# Hone

[![CI](https://github.com/YellowFoxH4XOR/hone/actions/workflows/ci.yml/badge.svg)](https://github.com/YellowFoxH4XOR/hone/actions/workflows/ci.yml)

**Ship fast. Stay sharp.**

Hone is a Claude Code plugin that selectively turns the AI from an *author* into a
*reviewer and mentor* — on the small fraction of tasks where doing the thinking
yourself is what keeps you promotable, interview-ready, and worth your title.
On everything else, it is completely invisible.

> Anthropic's own research (Jan 2026) found developers who leaned on AI to learn an
> unfamiliar library scored ~17 points lower on comprehension than hand-coders —
> with **no significant speed gain**. Meanwhile "did AI make me a worse programmer?"
> keeps hitting the HN front page. Hone exists so you never have to ask.

## How it works

Most prompts pass through untouched. Boilerplate, tests, docs, renames, CRUD,
formatting — vanilla Claude Code, zero added friction, ~40ms of routing overhead.

When you hit a **learning-worthy task** — a race condition, an architecture call, a
"why does this only fail in CI?" — and you're within your **learning budget**
(default: 100%, i.e. every learning task; dial it down if that's too much), Hone
flips the interaction:

1. **Solution Gate** — before writing any code, Claude asks for *your* approach
   first (max 3 sharp questions). File edits are blocked until you've answered.
2. **Hint Levels** — after you answer, Claude coaches at your dial setting:

   | Level | Behavior |
   |---|---|
   | 0 | Questions only *(default)* |
   | 1 | Small nudges |
   | 2 | High-level ideas, no code |
   | 3 | Pseudocode |
   | 4 | Partial implementation, you finish it |
   | 5 | Full implementation (vanilla Claude) |

3. **Socratic review** — instead of "here's the fix": *what happens under
   concurrency? where does this fail first? how would you know in prod?*

At hint level 5 Hone doesn't gate at all — every prompt passes through as
vanilla Claude Code, and nothing counts against the budget.

### Beyond the gate (Stage 1)

- **Auto-feedback** — after code is written during a coached task, Hone gives a
  short senior-lens review (edge cases, failure modes, one thing to check) so
  you learn what to look for. It never silently rewrites your code.
- **Reflection** — once per coached session, Hone asks for a quick recap ("what
  was hardest? explain it back without looking"). On by default — reflection is
  the consolidation step; set `reflection: optional` or `off` to soften it.
- **Skill profile & adaptive coaching** — Hone keeps a per-category proficiency
  profile (see `/hone:status`) that moves as you work: up when you engage a gate
  at a low hint level, down when you skip or lean on full solutions. With
  `adaptive: true`, your *weak* areas get more Socratic questioning and bypass
  the budget, while *strong* areas get more direct help. The profile is a
  **directional behavioral signal — not a graded test score** — and it's a
  no-op until it has learned enough about you to matter.

Not feeling it today? `/hone:skip` and Claude just writes the code. Always.

## Install

```
/plugin marketplace add YellowFoxH4XOR/hone
/plugin install hone@hone
```

Requires Node.js ≥ 22.18. Hone is written in TypeScript and runs directly via
Node's native type stripping — no build step, no runtime dependencies, no
`node_modules` on your machine. (Node 22 and 24 are the currently supported
release lines; if you're pinned to something older, open an issue and we'll
ship a compiled fallback.)

## Commands

| Command | Effect |
|---|---|
| `/hone:status` | Hint level, budget usage, gate state, per-category stats |
| `/hone:skip` | Skip the gate for the current task — implement directly |
| `/hone:hint <0-5>` | Set the hint level |
| `/hone:off` / `/hone:on` | Disable / enable entirely |

## Configuration

`~/.claude/hone/config.yaml` (created on first run), overridable per-repo with
`.hone.yaml`:

```yaml
hone:
  enabled: true
  learning_budget: 100         # % of eligible (learning) tasks that get coached
  hint_level: 0                # 0–5, see table above
  reflection: on               # once-per-session recap after coached work
  review_only: true            # never rewrites your code unrequested
  autofeedback: true           # senior-lens review of code written during coached tasks
  adaptive: true               # bias coaching by your skill profile (no-op until it learns)
  categories:
    # always_coach bypasses the budget; never_coach mutes a *learning* category
    always_coach: [architecture, concurrency, distributed_systems, security]
    never_coach: []
```

The defaults are deliberately assertive — every learning task is coached,
questions-only, reflection on — because Hone exists to make you think. If that's
more friction than you want, dial `learning_budget` down (at 20% exactly the
5th, 10th, 15th… eligible learning task gets coached — the ratio is enforced
exactly and deterministically, never randomly) and raise `hint_level`.

## What gets classified as "learning"?

A fast local heuristic router (no model call, no network, ~0.1ms) scores each
prompt against signal families: diagnostic language ("only fails in CI",
"keeps climbing", "no idea why"), architecture and design decisions, concurrency
and distributed-systems reasoning, security questions, performance
investigation, algorithmic work, and concept-understanding questions.

Design bias: **execution wins every tie.** On our labeled test sets (in-repo,
including an independently generated adversarial set), execution→coaching
misclassification — the annoying direction — is under 2%; the PRD requirement
is <5%. If Hone ever coaches you on a task that didn't deserve it, that's a
bug: open an issue with the prompt.

## Privacy

Everything is local: profile, counters, and session state live in
`~/.claude/hone/` as plain JSON you can read and delete. Nothing leaves your
machine. No telemetry, no accounts.

## Known limitations (by design, documented rather than hidden)

- **The gate is a speed bump, not a jail.** `PreToolUse` denial blocks
  Write/Edit/NotebookEdit and file-writing Bash while the gate is open, but
  clever indirection can get around it. That's fine — the point is the moment
  of reflection, not enforcement theater.
- **Classification is heuristic.** It will occasionally miss a learning moment
  (it is tuned to never annoy you rather than to never miss).
- **Metrics are directional.** Counters measure coached interactions honestly,
  but nothing here claims to be a precise measure of your skill.
- **One session at a time for `/hone:skip`.** The skip command targets the most
  recently active session; with several concurrent sessions mid-gate, skip the
  one you're in by answering or toggling `/hone:off`.

## Roadmap

Stage 0 (this release): intent router + budget, solution gate, hint levels,
Socratic reviews. Stage 1: skill profile, adaptive coaching, local dashboard,
progressive independence. Stage 2: Interview Mode, Challenge Mode (exercises
generated from *your* repo). See `docs/PRD.md`.

## Development

```
npm test             # 52 tests: unit, labeled-dataset accuracy, end-to-end hooks
npm run typecheck    # tsc --noEmit (strict, erasable-syntax-only)
```

TypeScript throughout, but constrained to erasable syntax (`erasableSyntaxOnly`)
so every file executes directly under Node's type stripping — the .ts files ARE
the shipped artifact. `typescript` is a devDependency used only for checking.

State layout: `config.yaml` is yours (never machine-edited); `state.json` holds
runtime toggles set by commands; `profile.json` accumulates counters;
`sessions/` tracks per-session gate state (GC'd after 7 days).

MIT license. Coaching prompt packs and classifier signals are the contribution
surface — PRs welcome.
