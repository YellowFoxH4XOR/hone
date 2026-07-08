// F1 Intent Router — classifies each user prompt as a learning task (eligible
// for coaching) or an execution task (pass through untouched).
//
// Design bias: the PRD's acceptance criterion is asymmetric. Misclassifying
// execution -> coaching is the annoying direction and must stay <5%; the
// reverse just misses a coaching opportunity. So execution wins every tie,
// and "learning" requires either two independent signals or one strong
// (weight-2) signal.

import type { Classification, Intent } from './types.ts';

const LEARNING = 'learning' as const;
const EXECUTION = 'execution' as const;

interface CategoryDef {
  intent: Intent;
  signals: ReadonlyArray<readonly [RegExp, number]>;
}

// [regex, weight] — matched against the lowercased prompt.
const SIGNALS: Record<string, CategoryDef> = {
  // ---- learning categories -------------------------------------------------
  algorithms: {
    intent: LEARNING,
    signals: [
      [/\bbig[- ]?o\b/, 2],
      [/\b(time|space) complexity\b/, 2],
      [/\bdynamic programming\b/, 2],
      [/\b(memoiz|backtrack)/, 2],
      [/\brecursi(on|ve)\b/, 1],
      [/\bbinary (search|tree)\b/, 1],
      [/\b(bfs|dfs|dijkstra|a-star|topological sort|graph traversal)\b/, 2],
      [/\bsort(ing)? algorithm/, 2],
      [/\b(leetcode|coding interview)\b/, 2],
      [/\b(linked list|priority queue|hash ?(map|table)|trie|heap)\b/, 1],
      [/\b(bloom filter|hyperloglog|bitmap index)\b/, 2],
      [/\balgorithms?\b/, 1],
    ],
  },
  debugging: {
    intent: LEARNING,
    signals: [
      [/\bwhy (is|does|do|isn't|doesn't|won't|can't|are|did|would|am i)\b/, 1],
      [/\broot[- ]caus/, 2],
      [/\b(intermittent(ly)?|flaky|flak(es?|ing)|sporadic(ally)?)\b/, 2],
      [/\b(randomly|sometimes|occasionally) (fail|crash|break|hang|happen|return)/, 2],
      [/\bcan'?t (figure out|reproduce|understand|work out) why\b/, 2],
      [/\bcan'?t (figure out|reproduce)\b/, 1],
      [/\bmemory leaks?\b/, 2],
      [/\b(segfaults?|core dumps?|heisenbugs?)\b/, 2],
      [/\bkeeps? (crashing|failing|hanging|timing out|throwing|rejecting)\b/, 2],
      [/\bwhat('s| is) (actually |really )?(going on|happening|triggering)\b/, 2],
      [/\btrying to (pin down|track down|nail down|isolate|narrow down)\b/, 2],
      [/\bany idea (why|what|how|where)\b/, 2],
      [/\bwhy\?*\s*$/, 2],
      [/\bcan'?t repro(duce)?\b/, 2],
      [/\bno code changes\b/, 1],
      [/\bon its own\b/, 1],
      [/\b(hangs?|freezes?) (on|when|during|at)\b/, 2],
      [/\bbut only (when|if|on|during|in)\b/, 2],
      [/\b(works?|pass(es)?|runs?|succeeds?) (locally|on my machine|in (dev|staging|ci|development)|on (staging|ci)) but\b/, 2],
      [/\bonly (fails|happens|breaks|crashes) (in|on|when|under)\b/, 2],
      [/\bhelp me (understand|figure out|debug|trace)\b/, 2],
      [/\bfigure out (why|what|where|how)\b/, 2],
      [/\b(no idea|not sure|don'?t know) (why|what|where|how|if)\b/, 2],
      [/\bwhat am i missing\b/, 2],
      [/\b(don'?t|can'?t) understand\b/, 2],
      [/\btrying to (actually |really )?understand\b/, 2],
      [/\bkeeps? (climbing|growing|increasing|rising|falling behind|flapping)\b/, 2],
      [/\b(oom[- ]?kill|oomkilled)/i, 2],
      [/\bflap(s|ping)\b/, 2],
      [/\b\d+ in \d+ (runs|times|requests|cases)\b/, 2],
      [/\bcan'?t (see|tell) (where|why|what)\b/, 2],
      [/\bcannot see (where|why|what)\b/, 2],
      [/\bevery time (we|i|you) (deploy|restart|push|release)\b/, 1],
      [/\b(returns?|returning|gives?|giving|produces?) the wrong\b/, 2],
      [/\bwrong (result|value|answer|output|index)\b/, 1],
      [/\bdebug(ging)? (this|the|a|an|why|it)\b/, 1],
      [/\bstack trace\b/, 1],
    ],
  },
  architecture: {
    intent: LEARNING,
    signals: [
      [/\barchitect(ure|ural)?\b/, 2],
      [/\bdesign pattern/, 2],
      [/\b(coupling|cohesion|decouple|modulari[sz])/, 2],
      [/\btrade-? ?offs?\b/, 2],
      [/\bshould (i|we) (use|structure|split|organize|separate|keep)\b/, 2],
      [/\b(hexagonal|clean architecture|domain[- ]driven|\bddd\b|monolith)/, 2],
      [/\b(module|service|domain|component) boundar/, 2],
      [/\bdependency (injection|inversion)\b/, 1],
      [/\b(structure|organize) (the|my|this|our) (code|project|codebase|repo)/, 1],
      [/\bsingle responsibility|solid principles?\b/, 2],
      [/\bown its own (database|db|schema|data)\b/, 2],
      [/\bfailure modes?\b/, 2],
      [/\bsanity[- ]check\b/, 2],
      [/\b(help me )?reason (about|through)\b/, 2],
      [/\bam i (missing something|overcomplicating|overthinking|wrong)\b/, 2],
      [/\bor am i\b/, 1],
      [/\b(weighing|torn between|debating) (whether|if|between)?\b/, 2],
      [/\bor is (that|it|this)\b/, 2],
      [/\b\w+[- ]first or \w+[- ]first\b/, 2],
    ],
  },
  system_design: {
    intent: LEARNING,
    signals: [
      [/\bsystem design\b/, 2],
      [/\bdesign (a|an|the) (system|service|api|platform|schema|pipeline|architecture)\b/, 2],
      [/\b(scalab|scale (to|this|out|up)|horizontally scal)/, 2],
      [/\bload balanc/, 1],
      [/\bshard(ing|ed)?\b/, 2],
      [/\bback[- ]?of[- ]?the[- ]?envelope|capacity plan/, 2],
      [/\b(high availability|fault[- ]toleran|disaster recovery)/, 2],
      [/\brate limit(er|ing)? (design|strategy|algorithm)/, 2],
      [/\bdesign (a|an|the) [^.]{0,40}\b(limiter|queue|cache|scheduler|crawler|shortener|feed|notification)/, 2],
      [/\b(zero[- ]downtime|blue[- ]green|canary)\b/, 2],
      [/\bbackpressure\b/, 2],
      [/\brate limit/, 1],
      [/\b(pub[- \/]?sub|event[- ]driven|event sourcing|cqrs)\b/, 1],
    ],
  },
  concurrency: {
    intent: LEARNING,
    signals: [
      [/\bconcurren(t|cy)\b/, 2],
      [/\brace condition/, 2],
      [/\b(deadlocks?|livelocks?|starvation)\b/, 2],
      [/\b(mutex(es)?|semaphores?|spinlocks?)\b/, 2],
      [/\bthread[- ]?saf/, 2],
      [/\block(ing)? (contention|ordering|order|free|scheme|strategy|protocol)/, 2],
      [/\bdouble[- ](process|charge|send|submit|fire|count)/, 2],
      [/\b(charges?|charged|processed|sent|submitted|fires?|fired|counted) twice\b/, 2],
      [/\b(find|spot|trace|found) the race\b/, 2],
      [/\b(goroutines?|threads?|connections?|handles?|file descriptors?) (are |keep |keeps )?leak/, 2],
      [/\batomic(ity|ally)?\b/, 1],
      [/\bsynchroniz/, 1],
      [/\bparallel(ism|ize)?\b/, 1],
      [/\bgoroutine|threading|multiprocess/, 1],
    ],
  },
  distributed_systems: {
    intent: LEARNING,
    signals: [
      [/\bdistributed\b/, 2],
      [/\b(consensus|raft|paxos)\b/, 2],
      [/\beventual(ly)?[- ]consisten/, 2],
      [/\bcap theorem\b/, 2],
      [/\bidempoten/, 2],
      [/\b(exactly|at[- ]least|at[- ]most)[- ]once\b/, 2],
      [/\b(split[- ]brain|network partition)/, 2],
      [/\b(saga pattern|two[- ]phase commit|\b2pc\b)/, 2],
      [/\b(clock skew|vector clock|lamport)/, 2],
      [/\b(outbox pattern|dead[- ]letter)/, 2],
      [/\bsafe to retry\b/, 2],
      [/\bthundering herd\b/, 2],
      [/\bleader election\b/, 2],
      [/\bout of sync\b/, 2],
      [/\bfails? halfway\b/, 2],
      [/\blos(e|ing) (messages|events|data|writes)\b/, 2],
      [/\breplication (lag|slot|keeps)/, 2],
      [/\bfall(s|ing)? behind\b/, 1],
      [/\bstale (data|cache|reads?|values?)\b/, 1],
      [/\bmessage (queue|broker)\b/, 1],
      [/\bmicroservices?\b/, 1],
      [/\b(retry|backoff) (strategy|logic|semantics)/, 1],
    ],
  },
  security: {
    intent: LEARNING,
    signals: [
      [/\bvulnerab/, 2],
      [/\b(xss|csrf|ssrf|sql injection|sqli|rce|xxe|idor)\b/, 2],
      [/\bthreat model/, 2],
      [/\bowasp\b/, 2],
      [/\b(jwt|oauth|token|session)s?\b[^.]{0,60}\b(secure(ly)?|storage|store|stored|expir|refresh|rotat|revok)/, 2],
      [/\bpassword[^.]{0,30}\b(hash|salt|encrypt|store)|(hash|salt|encrypt)[^.]{0,30}\bpassword/, 2],
      [/\bsecrets? (management|rotation|handling)\b/, 2],
      [/\bprivilege escalation|least privilege\b/, 2],
      [/\bblast radius\b/, 2],
      [/\b(mtls|client certs?)\b/, 2],
      [/\bis it safe to\b/, 1],
      [/\bservice account token\b/, 1],
      [/\b(security|secure|insecure)\b/, 1],
      [/\bauth(entication|orization)\b/, 1],
      [/\bsanitiz/, 1],
      [/\bcors\b/, 1],
    ],
  },
  performance: {
    intent: LEARNING,
    signals: [
      // "profiler"/"profiling", or "profile" as a verb — NOT the noun
      // ("user profile", "distribution profile" are execution vocabulary).
      [/\bprofil(er|ing)\b/, 2],
      [/\bprofile (this|the|it|that|my|our)\b/, 2],
      [/\bn\s*\+\s*1\b/, 2],
      [/\b(latency|throughput|p9[59])\b/, 2],
      [/\bcach(e|ing) (strategy|invalidation|layer)/, 2],
      [/\bbottleneck/, 2],
      [/\b(query|queries|endpoint|page|build|test suite) (is |are )?(too )?slow/, 2],
      [/\bslow (quer|response|render|load)/, 2],
      [/\boptimi[sz](e|ing|ation)\b/, 1],
      [/\bperformance\b/, 1],
      [/\bmemory (usage|footprint|pressure)/, 1],
      [/\b(benchmark|flame ?graph)/, 2],
      [/\bstampede/, 2],
      [/\b(query planner|seq(uential)? scan|index scan|autovacuum)\b/, 2],
      [/\bconsumer lag/, 1],
      [/\brebalanc/, 1],
      [/\bspike(s|d)?\b/, 1],
      [/\bblow(ing|s)? up (memory|the heap|ram)\b/, 2],
      [/\b(ran|runs?|got|became|is) \d+x (slower|faster)\b/, 2],
      [/\bunder (heavy )?load\b/, 1],
      [/\bmemory (on |in )?(the )?\w* ?(keeps? )?(climbing|growing)/, 2],
      [/\b(leak(ing)?|fragmentation)\b/, 1],
    ],
  },
  new_framework: {
    intent: LEARNING,
    signals: [
      [/\bhow (does|do|is)\b[^.]{0,80}\bwork(s)?\b/, 2],
      [/\bexplain\b/, 2],
      [/\b(new to|first time (using|with)|never used|unfamiliar with)\b/, 2],
      [/\bwhat('s| is) the difference between/, 2],
      [/\b(idiomatic|the right way|the proper way)\b/, 2],
      [/\bwalk me through\b/, 2],
      [/\bteach me\b/, 2],
      [/\bunderstand(ing)?\b/, 1],
      [/\blearn(ing)?\b/, 1],
      [/\bbest practices?\b/, 1],
      [/\bwhat (is|are)\b/, 1],
      [/\bwhen (should|would) (i|you|we) use\b/, 2],
      [/\bwhat does (that|this|it) (actually |really )?mean\b/, 2],
      [/\bhow (do|would) (people|you|we|others) (usually |normally |typically )?(solve|handle|approach|deal with|think about)/, 2],
      [/\bwhat('s| is) (a good|the best|the right) (approach|way|strategy|pattern)/, 2],
      [/\b(someone|somebody) mentioned\b/, 1],
    ],
  },

  // ---- execution categories ------------------------------------------------
  tests: {
    intent: EXECUTION,
    signals: [
      [/\b(write|add|create|generate|update|fix|run)\b[^.]{0,50}\btests?\b/, 2],
      [/\b(unit|integration|e2e|end-to-end|snapshot|regression) tests?\b/, 2],
      [/\btest (coverage|suite|file|cases?|fixtures?)\b/, 1],
      [/\b(jest|pytest|vitest|mocha|junit|rspec|playwright|cypress)\b/, 1],
      [/\b(mock|stub|spy)(s|ing|ped)?\b/, 1],
      [/\bfailing tests? (fix|pass)|make (the )?tests? pass/, 2],
    ],
  },
  documentation: {
    intent: EXECUTION,
    signals: [
      [/\b(readme|changelog|docstrings?|jsdoc|javadoc)\b/, 2],
      [/\b(write|add|update|generate|improve)\b[^.]{0,40}\b(docs?|documentation|comments?)\b/, 2],
      [/\bdocument (this|the|these|my|it)\b/, 2],
      [/\bapi (docs|reference|documentation)\b/, 1],
      [/\bcode comments?\b/, 1],
    ],
  },
  formatting: {
    intent: EXECUTION,
    signals: [
      [/\b(format|reformat)\b/, 2],
      [/\b(prettier|eslint|lint(er|ing)?|flake8|ruff|black|rubocop|gofmt|clang-format)\b/, 2],
      [/\b(indent(ation)?|whitespace|trailing (spaces?|commas?)|semicolons?)\b/, 2],
      [/\bcode style\b/, 1],
      [/\b(fix|clean up|remove) (the )?(unused )?(imports?|warnings?)\b/, 2],
      [/\btypo\b/, 2],
    ],
  },
  migrations: {
    intent: EXECUTION,
    signals: [
      [/\bmigrat(e|ion|ions|ing)\b/, 2],
      [/\b(alembic|flyway|liquibase|prisma migrate|rails db)\b/, 2],
      [/\b(bump|upgrade|update)\b[^.]{0,40}\b(version|dependenc|packages?|library|libraries)\b/, 2],
      [/\bschema (change|update)\b/, 1],
    ],
  },
  renames: {
    intent: EXECUTION,
    signals: [
      [/\brenam(e|ing)\b/, 2],
      [/\bmove\b[^.]{0,40}\b(files?|folders?|director(y|ies)|into|to)\b/, 1],
      [/\b(find|search) and replace\b/, 2],
      [/\breplace all (occurrences|instances|usages)\b/, 2],
    ],
  },
  refactoring: {
    intent: EXECUTION,
    signals: [
      [/\brefactor/, 2],
      [/\bextract (a |the )?(method|function|component|class|helper|hook)/, 2],
      [/\b(deduplicate|dedupe|consolidate)\b/, 2],
      [/\bsplit (this|the) (file|function|component|module|class)/, 2],
      [/\bconvert (this|the|it|to)\b/, 1],
      [/\bcomment (it |this |that )?out\b/, 2],
      [/\bclean ?up\b/, 1],
      [/\bsimplify (this|the|it)\b/, 1],
      [/\b(tidy|reorganize|inline)\b/, 1],
    ],
  },
  crud: {
    intent: EXECUTION,
    signals: [
      [/\bcrud\b/, 2],
      [/\b(add|create|build|new|write)\b[^.]{0,50}\b(endpoints?|routes?|handlers?|controllers?)\b/, 2],
      [/\b(get|post|put|patch|delete) (endpoint|route|handler|request)/, 2],
      [/\b(rest|graphql) (api|resolver|mutation|query)\b/, 1],
      [/\b(form|page|screen|view) (for|to) (creat|edit|add|delet|list|updat)/, 2],
      [/\b(list|detail|create|edit|delete) (page|view|screen)\b/, 1],
      [/\b(save|fetch|load) (to|from) (the )?(database|db|api)\b/, 1],
    ],
  },
  react_components: {
    intent: EXECUTION,
    signals: [
      [/\b(create|build|add|make|write)\b[^.]{0,50}\b(component|button|modal|dialog|dropdown|navbar|sidebar|tooltip|carousel|accordion|spinner|toast|banner)\b/, 2],
      [/\b(react|vue|svelte|angular) component\b/, 2],
      [/\b(css|tailwind|styled-components|styling|stylesheet)\b/, 1],
      [/\b(responsive|dark mode|theme toggle)\b/, 1],
      [/\bcenter (the|a|this)\b/, 1],
      [/\b(padding|margin|flexbox|grid layout)\b/, 1],
    ],
  },
  boilerplate: {
    intent: EXECUTION,
    signals: [
      [/\b(boilerplate|scaffold(ing)?)\b/, 2],
      [/\b(set ?up|configure|init(ialize)?)\b[^.]{0,50}\b(project|repo|eslint|tsconfig|webpack|vite|docker|ci|cd|pipeline|prettier|babel|env)/, 2],
      [/\b(dockerfile|docker-compose|github actions?|gitlab ci|jenkinsfile)\b/, 2],
      [/\b(install|npm (i|install)|pip install|yarn add|cargo add|brew install)\b/, 2],
      [/\b(env|environment) (var(iable)?s?|file)\b/, 1],
      [/\b\.?gitignore\b/, 2],
      [/\bconfig(uration)? (file|option|value)\b/, 1],
      [/\b(stub|skeleton|template) (out|for|file)\b/, 1],
    ],
  },
};

// Prompts that are conversation flow, not tasks — never classify these.
const CONTINUATION = /^(y|n|yes|no|ok|okay|k|sure|yep|yeah|nope|go ahead|do it|proceed|continue|next|thanks|thank you|ty|lgtm|sounds good|looks good|perfect|great|nice|cool|done|stop|wait|hold on|nevermind|never mind)\b[\s!.,]*$/i;

const INTERROGATIVE = /^(why|how|what|when|where|which|should|is|are|does|do|can|could|would|will)\b/;

const IMPERATIVE = /^(add|write|create|generate|make|build|update|change|fix|rename|move|delete|remove|drop|bump|install|set ?up|setup|format|lint|refactor|convert|extract|run|deploy|commit|push|merge|revert|apply|copy|paste|replace|implement|wire|hook)\b/;

// A decisive closing instruction anywhere in the prompt — the user has ALREADY
// picked the approach and is telling us to just do it ("...just add a timeout
// and retry for now"). The leading-anchored INTERROGATIVE/IMPERATIVE checks
// can't see this, so a question that ends in a command used to read as pure
// learning and (wrongly) opened the gate.
const DECISIVE_CLOSER =
  /\b(just|simply|go ahead and|let'?s just|for now,? just|can you just|please just)\s+(add|use|make|write|put|set|create|do|implement|change|fix|apply|wire|update|remove|delete|drop|refactor|move|rename|run|build|generate)\b/;

// The last sentence/clause of the prompt, lowercased. Splitting on sentence
// terminators and newlines is enough to catch "…? Now do X." style closers.
function lastClause(lower: string): string {
  const parts = lower
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : lower.trim();
}

export function classify(prompt: unknown): Classification {
  const text = String(prompt ?? '').trim();
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);

  // Guard rails: short prompts, slash commands, continuations, @-file-only.
  if (
    text === '' ||
    text.startsWith('/') ||
    words.length < 3 ||
    text.length < 12 ||
    (words.length <= 5 && CONTINUATION.test(lower))
  ) {
    return {
      intent: EXECUTION,
      category: 'passthrough',
      passthrough: true,
      scores: { learning: 0, execution: 0 },
      signals: [],
    };
  }

  const matched: Array<{ category: string; signal: string; weight: number }> = [];
  let bestLearn: { category: string | null; score: number } = { category: null, score: 0 };
  let bestExec: { category: string | null; score: number } = { category: null, score: 0 };

  for (const [category, def] of Object.entries(SIGNALS)) {
    let score = 0;
    for (const [re, weight] of def.signals) {
      if (re.test(lower)) {
        score += weight;
        matched.push({ category, signal: re.source, weight });
      }
    }
    if (score === 0) continue;
    if (def.intent === LEARNING && score > bestLearn.score) {
      bestLearn = { category, score };
    } else if (def.intent === EXECUTION && score > bestExec.score) {
      bestExec = { category, score };
    }
  }

  // Phrasing adjustments: questions lean learning (only if a learning signal
  // already fired — never invent learning from tone alone); imperative openers
  // and closing instructions lean execution.
  let learnScore = bestLearn.score;
  let execScore = bestExec.score;

  // Closing-clause override: a prompt that ENDS in an explicit instruction means
  // the user already made the call — don't hand them a Socratic gate. A decisive
  // closer ("just add X for now") is a strong execution signal and cancels the
  // "this is a question" learning bonus; a plain trailing imperative sentence
  // (distinct from the opener) is a milder one.
  const decisiveCloser = DECISIVE_CLOSER.test(lower);
  const closer = lastClause(lower);
  const plainClosingImperative = !decisiveCloser && closer !== lower && IMPERATIVE.test(closer);

  if (learnScore > 0 && !decisiveCloser && (INTERROGATIVE.test(lower) || /\?\s*$/.test(text))) {
    learnScore += 1;
  }
  if (IMPERATIVE.test(lower)) {
    execScore += 1;
  }
  if (decisiveCloser) {
    execScore += 2;
  } else if (plainClosingImperative) {
    execScore += 1;
  }

  const isLearning =
    learnScore > execScore && learnScore >= 2 && bestLearn.category !== null;

  return {
    intent: isLearning ? LEARNING : EXECUTION,
    category:
      isLearning && bestLearn.category !== null
        ? bestLearn.category
        : bestExec.category || 'general',
    passthrough: false,
    scores: { learning: learnScore, execution: execScore },
    signals: matched.map((m) => `${m.category}(${m.weight}): ${m.signal}`),
  };
}

export const LEARNING_CATEGORIES: string[] = Object.entries(SIGNALS)
  .filter(([, d]) => d.intent === LEARNING)
  .map(([name]) => name);

export const EXECUTION_CATEGORIES: string[] = Object.entries(SIGNALS)
  .filter(([, d]) => d.intent === EXECUTION)
  .map(([name]) => name);
