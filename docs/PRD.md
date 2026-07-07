# PRD: Hone

**An open-source Claude Code plugin that makes developers better engineers — not just faster ones.**

| | |
|---|---|
| Status | Draft v1.1 (renamed to Hone) |
| Date | July 7, 2026 |
| Type | Open-source developer tool (Claude Code plugin) |
| License | MIT (proposed) |
| Author | TBD |

---

## 1. One-liner

Hone is a behavioral layer for Claude Code that selectively turns the AI from an *author* into a *reviewer, mentor, and interviewer* — gating code generation on learning-worthy tasks, staying invisible on execution tasks, and measuring the developer's skill growth over time.

---

## 2. Vision & Positioning

Every AI coding assistant competes on the same metric: **time to code**. Hone competes on a different one: **growth of the developer**.

**Positioning decision (deliberate):** Hone is marketed as a *developer performance* tool, not a *learning* tool. The promise is "ship faster *and* stay promotion-ready / interview-ready / senior-track," never "eat your vegetables." Learning is the mechanism; performance is the message.

**Core principle:** *Create first. Ask AI for feedback second.* — but only when it's worth it. The Learning Budget and intent routing exist so that coaching never becomes a tax on ordinary work.

---

## 3. Problem & Evidence

Modern AI assistants immediately produce solutions, which improves short-term output but erodes independent problem-solving, recall, debugging skill, architectural thinking, and interview readiness. This is no longer speculation:

- **Anthropic (Jan 2026), "How AI Impacts Skill Formation":** developers who used AI to learn an unfamiliar library scored ~50% on a comprehension quiz vs ~67% for hand-coders — roughly two letter grades (d = 0.738, p = 0.01) — with no significant speed gain. Anthropic notes effects are likely *more* pronounced for agentic tools like Claude Code.
- **METR RCT (Jul 2025):** experienced devs believed AI made them 20% faster; it actually made them 19% *slower* — a perception gap that also predicts developers won't self-diagnose deskilling.
- **Microsoft/CMU (CHI 2025):** higher trust in GenAI correlates with less critical thinking; cognition left "atrophied and unprepared."
- **GitClear (2025, 211M lines):** copy/pasted code rose from 8.3% → 12.3% and exceeded refactored code for the first time; 8× growth in duplicated 5+ line blocks during 2024.
- **Labor market:** Big Tech new-grad hiring down 25% (2024, SignalFire); dev employment for ages 22–25 down ~20% from peak (Stanford). The "who becomes senior?" anxiety is real and growing.
- **Sentiment:** Stack Overflow 2025 — 84% use AI, but trust in accuracy fell to 29% and active distrust (46%) now exceeds trust (33%). "Did AI make you a worse programmer?" is a recurring top HN/Reddit thread.

No developer tool currently operates *inside the real agentic coding workflow* and intentionally optimizes for skill retention while preserving productivity.

---

## 4. Goals

1. Encourage independent thinking on tasks where thinking matters.
2. Measurably improve engineering skills over time (skill profile trends, hint level trending down).
3. Reduce AI dependence gradually (Progressive Independence).
4. Preserve productivity — coaching interactions capped by a configurable Learning Budget (default ~20% of eligible requests).
5. Integrate natively with Claude Code (hooks, output styles, skills); zero workflow migration.
6. Stay honest: metrics presented as directional signals, not precise scores.

## 5. Non-Goals

- Not another coding agent, autocomplete engine, defect-hunting code-review bot, or IDE.
- Not a learning *destination* (no courses, no separate study sessions) — coaching happens inside real work on the real repo.
- Not an always-on interrogation. If most users disable it within days, the product has failed regardless of pedagogy.
- v1 does not attempt team analytics, multi-model support, or IDE-agnostic operation (see Roadmap).

---

## 6. Users & Personas

| Persona | Primary need | Key features |
|---|---|---|
| Junior developer | Guidance without complete solutions; build fundamentals employers now doubt juniors have | Solution Gate, Hint Levels, Reflection |
| Mid-level engineer | Architectural feedback, debugging habits, interview prep | Socratic Reviews, Interview Mode, Skill Profile |
| Senior engineer | Challenge, not implementation; a peer to critique decisions | Interview Mode, Challenge Mode, aggressive architecture mode |
| Staff engineer | Design reviews, tradeoff and failure-mode analysis | Socratic Reviews, Challenge Mode |
| Engineering manager / L&D (future) | Team skill-growth visibility, AI-reliance trends | Team dashboard (Stage 3, monetization path) |

---

## 7. Competitive Landscape & Differentiation

| Competitor | What it does | What it lacks |
|---|---|---|
| **Anthropic Learning/Explanatory output styles + official learning plugin** | Tone/interaction change; `TODO(human)` markers, insight callouts | No gating, no intent detection, no metrics, no skill profile, no budget. Anthropic's own README warns about token cost |
| **Superpowers (obra)** — ~200k stars, ~900k installs | Forces brainstorm → spec → plan → TDD before code | Gates for *engineering discipline*, not skill growth; no learner profile, no intent routing |
| **GitHub Copilot tutor config** | Manual `copilot-instructions.md` "act as a tutor" recipe | No enforcement, persistence, or product surface |
| **CS50 Duck (cs50.ai)** | Socratic tutor with usage throttling — proof the model works | Learning destination; not in the professional workflow |
| **claude-tutor / claude-teacher-plugin** (3 / 0 stars) | Subject-agnostic tutoring, spaced repetition, local profile + web dashboard | No code gating, no intent classification, no coding-skill profile |
| **Exercism, boot.dev, Codecademy, Khanmigo** | Guide-don't-tell pedagogy | Separate study environments, not real repos |
| **interviewing.io, Exponent, Hello Interview** | Paid skill assessment — proves willingness to pay | "Get a job" context, not daily work |

**White space (verified, as of July 2026): nobody ships (a) a pedagogical Solution Gate, (b) learning-vs-execution intent classification, or (c) a persistent developer skill profile inside an agentic coding tool.** Socratic *tone* is commoditized; these three pillars are the differentiation. Hone must win on gate + routing + measurement, not on explanation quality (Anthropic's home turf).

---

## 8. Product Principles

1. **Invisible by default, decisive when active.** Execution tasks get vanilla Claude Code. Coaching fires only on classified learning tasks within budget.
2. **Never rewrite unrequested.** Feedback explains *why*; the user changes the code.
3. **Escape hatch always.** Any gate can be bypassed with one explicit command (`/hone skip`). Gating everything trains people to rubber-stamp.
4. **Measure directionally, claim honestly.** LOC attribution and "reasoning score" are approximate; the UI says so.
5. **Local-first & private.** Profile and metrics live in local JSON. Nothing leaves the machine in v1.

---

## 9. Features

Priorities: **P0** = MVP (Stage 0), **P1** = Stage 1, **P2** = Stage 2+.

### F1 — Intent Router + Learning Budget (P0) *(the load-bearing feature)*

A `UserPromptSubmit` hook classifies each prompt:

- **Execution tasks** → pass through untouched: boilerplate, tests, docs, formatting, migrations, renames, CRUD, refactors.
- **Learning tasks** → eligible for coaching: algorithms, debugging, architecture, system design, concurrency, distributed systems, security, new-framework exploration.

Classification: fast heuristics/keywords first; optional small-model classifier via HTTP hook later. The **Learning Budget** (default `20%`, configurable per category) deterministically caps how many eligible requests become coaching interactions. Users can pin categories to "always coach" or "never coach."

*Acceptance criteria:* classification adds <500ms latency; misclassification of execution→coaching (the annoying direction) <5% on a labeled test set; budget enforcement is exact.

### F2 — Solution Gate (P0)

On a coached request, Claude asks for the user's proposed approach before generating code (e.g., "Before we implement JWT auth: how will tokens be stored? What expiration strategy? How do refresh tokens work?"). Enforcement is layered:

- `UserPromptSubmit` sets gate state and injects Hone context.
- `PreToolUse` hook returns `permissionDecision: "deny"` on Write/Edit/relevant Bash while the gate is open — this blocks the tool even in `bypassPermissions` mode.
- Gate opens once the user has answered (state tracked per session), or on explicit `/hone skip`.

*Known bypass:* `@`-file inlining doesn't trigger PreToolUse; the prompt-level layer covers this. Document it; don't over-engineer.

### F3 — Hint Levels (P0)

| Level | Behavior |
|---|---|
| 0 | Questions only |
| 1 | Small nudges |
| 2 | High-level ideas |
| 3 | Pseudocode |
| 4 | Partial implementation |
| 5 | Full implementation (vanilla Claude) |

Default = 1. Adjustable any time (`/hone hint 3`). Current level shown in statusline. Average hint level over time is a core success metric (down = product working).

### F4 — Socratic Reviews (P0)

On coached tasks, instead of "here's the fix": *What assumptions are you making? What happens under concurrency? Where does this fail? How would you test it? What's the complexity? What would you monitor?* Implemented via a Hone output style + injected skill instructions. Never more than 3 questions per turn (friction control).

### F5 — Automatic Feedback on User Code (P1)

When the user writes code (detected via `PostToolUse`/diff heuristics), Hone reviews correctness, readability, naming, edge cases, performance, security, maintainability — and explains *why*, without rewriting unless asked.

### F6 — Reflection (P1)

A `Stop`-hook prompt after completing coached work: *What was hardest? What would you change? Explain the solution without looking.* Skippable, and rate-limited to at most once per session by default.

### F7 — Skill Profile & Adaptive Coaching (P1) *(the "aha" feature)*

Persistent local profile (`~/.claude/hone/profile.json`) tracking proficiency across **architecture, debugging, concurrency, testing, security, performance** (extensible schema). Updated from coached-interaction outcomes, reflection answers, and review findings.

```
Architecture   ███████░░░ 72
Debugging      █████████░ 88
Concurrency    ████░░░░░░ 41
Testing        ██████░░░░ 63
Security       █████░░░░░ 54
Performance    ███████░░░ 76
```

Adaptive behavior: coaching intensity increases in weak areas, backs off in strong ones. Over time the plugin learns when to challenge, when to stay silent, and when to just write the code. This turns daily work into personalized deliberate practice — the hardest-to-copy differentiator.

### F8 — Learning Dashboard + Gamification (P1)

- **Statusline:** streak, independence %, current hint level.
- **Local web dashboard** (bundled localhost server, the proven claude-tutor pattern): AI-generated vs user-written LOC %, AI-reviewed LOC %, independent coding time, questions answered before requesting code, reasoning score, GitHub-contributions-style streak graph, weekly report ("You solved 82% independently").
- Data sources: session transcript JSONL (`transcript_path` from hooks) + Claude Code's native OpenTelemetry metrics (token usage, cost, LOC changed, active time, tool accept/reject).
- All metrics labeled *directional*.

### F9 — Progressive Independence (P1)

As the profile improves in an area, default hint level for that area drifts down and the Solution Gate asks harder questions. Goal state: the user requests full implementations less often, unprompted.

### F10 — Interview Mode (P2)

Explicit opt-in (`/hone interview [system-design|coding|debugging]`). Claude acts as a senior-engineer interviewer: clarifying questions, pushback, follow-ups, design critique — no answers. Session ends with structured feedback mapped to the skill profile. Closest feature to proven willingness-to-pay (interview-prep market).

### F11 — Challenge Mode (P2)

Generates exercises **from the user's actual repository**: "find three race conditions in this module," "reduce DB calls in this handler," "improve coverage of X." Deliberately targets the profile's weak areas. No study sessions required — practice is embedded in the codebase you already own.

### F12 — Team Analytics (P2/Stage 3, monetization)

OTel → Prometheus/Grafana pipeline: aggregate skill growth, AI-reliance %, independent-coding time across a team. Sold to engineering managers / L&D budgets (US corporate training spend: ~$102.8B in 2025). Individual data anonymized/opt-in; the individual plugin stays free forever.

---

## 10. Technical Architecture (Claude Code, mid-2026 APIs)

```
┌─ Claude Code session ─────────────────────────────────────────┐
│                                                               │
│  UserPromptSubmit hook ──► Intent Router ──► Budget check     │
│        │                        │                             │
│        │ (learning + in-budget) │ (execution / over budget)   │
│        ▼                        ▼                             │
│  inject Hone context      pass through untouched             │
│  set gate state                                               │
│        │                                                      │
│  PreToolUse hook ──► deny Write/Edit while gate open          │
│  PostToolUse hook ──► user-code detection → auto feedback     │
│  Stop hook ──► reflection prompt, profile update,             │
│                transcript (JSONL) metric extraction           │
│  SessionStart hook ──► load profile, Hone output style       │
│                                                               │
└───────────────┬───────────────────────────────────────────────┘
                ▼
   ~/.claude/hone/profile.json  +  metrics store (local)
                ▼
   Statusline  ·  localhost dashboard  ·  (Stage 3: OTel export)
```

**Components:** hooks (command type for speed; HTTP/agent hooks optional for classification), a Hone output style (system-prompt level, persists across sessions, prompt-cached after first request), skills for Socratic review / interview / challenge prompts, slash commands (`/hone on|off|skip|hint N|status|interview|challenge`), local JSON persistence, bundled dashboard server.

**Distribution:** GitHub-based plugin marketplace (`/plugin marketplace add owner/repo`, `/plugin install hone@...`); pursue listing in community catalogs and, with traction, the official marketplace.

**Known limitations (documented, not hidden):**
- Hooks are synchronous — keep classification <500ms; heavier work runs async or at Stop.
- Coaching injections cost tokens; the Budget is a cost-control mechanism as much as a UX one.
- AI-vs-human LOC attribution is approximate (transcript diffs + OTel accept/reject signals).
- `@`-file references bypass PreToolUse; gate is layered, not absolute.
- System prompts aren't in transcripts; metric extraction relies on turn content and OTel.
- Plugin/hook APIs are evolving (~30 hook events as of July 2026); pin against documented behavior, CI against Claude Code releases.

---

## 11. Configuration

```yaml
# ~/.claude/hone/config.yaml
hone:
  enabled: true
  learning_budget: 20          # % of eligible requests that become coaching
  hint_level: 1                # 0–5 default
  review_only: true            # never rewrite user code unrequested
  allow_full_solution: true    # /hone skip always available
  reflection: optional         # off | optional | on
  interview_mode: false
  categories:
    always_coach:  [architecture, concurrency, distributed_systems, security]
    never_coach:   [boilerplate, tests, documentation, react_components, crud]
  dashboard:
    statusline: true
    local_server: true
    port: 4173
  telemetry:
    otel_export: false         # Stage 3 / teams
```

---

## 12. Success Metrics

| Stage | Metric | Target |
|---|---|---|
| 0 (wks 0–4) | GitHub stars | 500+ |
| 0 | **Week-2 retention (plugin still enabled)** | ≥40% — *the* go/no-go metric |
| 0 | Median added latency per prompt | <500ms |
| 1 (mo 2–4) | WAU retention | ≥30% |
| 1 | Users whose average hint level trends **down** over 4 weeks | ≥25% of active users |
| 1 | Independent-coding % trend among active users | rising |
| 2 | Interview/Challenge mode voluntary usage | ≥15% of WAU |
| 3 | Teams voluntarily standardizing the free plugin | ≥5 before building paid tier |
| 3 | Inbound manager/L&D interest | qualitative gate for monetization |

**Anti-metric:** if most installs disable within days *even at 20% budget*, the friction thesis has beaten the deskilling thesis → pivot to explicit opt-in "study session" mode (slash-command-gated, never ambient) before abandoning.

---

## 13. Roadmap

**Stage 0 — Validate the wedge (weeks 0–4).** Ship F1 + F2 + F3 + F4 only, ruthlessly minimal. `UserPromptSubmit` router with budget, `PreToolUse` gate, `Stop` reflection stub, minimal profile JSON. Marketplace distribution, Show HN / r/ClaudeAI launch. Measure retention above all.

**Stage 1 — Measurement & gamification (months 2–4).** F5–F9: dashboard, streaks, skill profile, adaptive coaching, progressive independence. Lock in "developer performance" messaging.

**Stage 2 — Premium-feeling modes (months 4–6).** F10 Interview Mode, F11 Challenge Mode — the most defensible features vs Anthropic built-ins and closest to willingness-to-pay.

**Stage 3 — Team analytics (months 6–12).** F12 OTel team dashboard for managers/L&D. First monetization; individual plugin remains free OSS.

**Contingencies:** (a) Anthropic ships native intent routing + skill metrics → pivot to team/L&D layer. (b) Strong retention, weak monetization → stay OSS, monetize team tier/sponsorship. (c) Friction kills retention → opt-in study-session repositioning.

---

## 14. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Friction intolerance** — devs install Claude Code to move fast; "good for you" tools get disabled | Critical | Learning Budget default 20%; execution tasks untouched; ≤3 questions/turn; one-command skip; performance (not learning) framing; week-2 retention as kill metric |
| Perception gap — devs don't believe they're deskilling (METR) | High | Sell outcomes (promotion, interviews, design quality); show the skill graph, not lectures |
| Anthropic deepens built-in Learning mode | High | Differentiate on gate + routing + profile, not tone; keep team-analytics escape hatch |
| Superpowers owns "think before code" mindshare | Medium | Position as complementary (discipline vs skill growth); consider interop |
| Token/cost overhead | Medium | Budget caps, prompt caching, terse coaching prompts, cost shown in dashboard |
| Metric credibility (fuzzy LOC attribution) | Medium | Label everything directional; never gamify a number we can't defend |
| Hook API churn | Medium | Thin adapter layer over hook I/O; CI against Claude Code releases |
| Socratic tone is commoditized (many 0–3 star clones) | Low | Tone is table stakes; moat is routing + profile + measurement |

---

## 15. Naming

**Decided: Hone.** One word, a verb, performance connotation ("hone your craft") with zero classroom overtone — exactly the "developer performance, not learning" positioning. Naming surface conventions: plugin/repo `hone`, slash commands `/hone …`, local state `~/.claude/hone/`, per-repo config `.hone.yaml`. Remaining action before Stage 0 launch: confirm availability of the GitHub org/repo name, npm package, and a usable domain (e.g., honedev.*, usehone.*), since `hone` alone is likely taken on npm.

---

## 16. Open-Source Strategy

- MIT license; individual plugin free forever.
- Local-first, privacy-first: no data leaves the machine without explicit opt-in (Stage 3 teams only).
- Claude Code–native first (contrarian vs "model-agnostic" instinct: depth on one platform beats shallow breadth; the hook APIs are the product). Model/IDE-agnostic abstraction only if Stage 1 succeeds.
- Community-maintained coaching prompt packs (per-language, per-domain) as the contribution surface.
- Repository-specific coaching rules (`.hone.yaml` in repo) for team conventions.

## 17. Open Questions

1. Classifier: pure heuristics vs small-model HTTP hook for intent routing — what accuracy do heuristics alone hit on a labeled prompt set?
2. Should the Solution Gate ever fire for senior-profile users, or should high proficiency route straight to Socratic review of *Claude's* plan instead?
3. Reflection cadence: per-task vs per-session vs weekly digest — which survives real usage?
4. How is "reasoning score" computed defensibly enough to display?
5. Interop with Superpowers: conflict, coexist, or integrate?
