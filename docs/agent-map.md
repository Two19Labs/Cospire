# Agent map

Where to go for what, and the route every piece of work takes from the first read
to the deployed URL. The diagrams render on GitHub; the tables under them say the
same thing in plain text for an agent reading the raw file.

The map shows where things live; it holds no project state. Current state is in
`CONTEXT.md`, and when this map and `CONTEXT.md` disagree, `CONTEXT.md` wins. When
either disagrees with the signed agreement, the agreement wins.

## 1. Where everything lives

```mermaid
flowchart LR
  subgraph AUTH["Authority, highest first"]
    AGR["../Context/ agreement<br/>WHAT is delivered"]
    MAN["../CLAUDE.md<br/>operating manual: HOW to build"]
  end

  subgraph ENTRY["Entry points, loaded or read first"]
    CL["CLAUDE.md<br/>Claude Code loads it"]
    AG["AGENTS.md<br/>every other agent"]
    RM["README.md<br/>people"]
  end

  subgraph STATE["Current state"]
    CTX["CONTEXT.md<br/>status, Active work, Pending,<br/>blockers, Next recommended action"]
  end

  subgraph HIST["History: docs/context/, read for your area"]
    H1["completed.md<br/>finished work and write-ups"]
    H2["meetings.md<br/>client calls and decisions"]
    H3["supabase.md<br/>hosted database state"]
    H4["phase-history.md<br/>phases, gates, audits"]
    H5["verification-log.md<br/>every check run"]
  end

  subgraph HOW["How the work is done"]
    PLAN["docs/implementation-plan.md<br/>phases and order"]
    REV["docs/review-checklist.md<br/>PR claims, reviewer checks"]
    BP["docs/branch-protection.md"]
    RUN["docs/supabase-phase-0-runbook.md"]
  end

  subgraph CODE["The code"]
    FEAT["src/features/NAME/<br/>one vertical slice each"]
    APP["src/app/<br/>thin routes, a loading.tsx each"]
    SH["src/shared/<br/>human-promoted only"]
    MIG["supabase/migrations/<br/>append-only, RLS in same file"]
    VER["scripts/verify/<br/>HTTP and SQL checks"]
  end

  AGR --> MAN --> CL & AG
  RM --> CTX
  CL --> CTX
  AG --> CTX
  CTX -->|"index says which"| HIST
  CTX --> PLAN
  PLAN --> CODE
  REV --> CODE
```

| You need | Go to |
|---|---|
| What is in or out of scope, what the Client is owed | `../Context/Two19Labs_Cospire_LMS_V1_Agreement (1).pdf`, then `../CLAUDE.md` section 12 |
| How to build anything: stack, structure, security, testing | `../CLAUDE.md` (the operating manual) |
| What is true right now, who is working on what, what is next | `CONTEXT.md` |
| What a past piece of work did and how it was verified | `docs/context/completed.md` |
| What the Client said or decided in a call | `docs/context/meetings.md`, full transcripts in `../Context/` |
| What is applied to the hosted database, Auth settings, advisors | `docs/context/supabase.md` |
| How a phase, exit gate or security audit went | `docs/context/phase-history.md` |
| The result of any check ever run | `docs/context/verification-log.md` |
| The order phases are built in, and each phase's tests | `docs/implementation-plan.md` |
| What a PR description must contain, what a reviewer checks | `docs/review-checklist.md` |
| A section named somewhere and not found | `grep -rn "<section name>" CONTEXT.md docs/context/` |

## 2. Where do I look? By task

```mermaid
flowchart TD
  Q{"What is the task?"}
  Q -->|"Build or change a feature"| F1["CONTEXT.md: Active work and Next"]
  F1 --> F2["docs/implementation-plan.md: the phase"]
  F2 --> F3["completed.md: how the neighbouring slice was built"]
  F3 --> F4["src/features/NAME/"]

  Q -->|"Schema, RLS, storage"| D1["docs/context/supabase.md"]
  D1 --> D2["supabase/migrations/: the latest files"]
  D2 --> D3["../CLAUDE.md sections 4 and 9"]

  Q -->|"Client asked for something"| C1["docs/context/meetings.md"]
  C1 --> C2{"In Annexure A?"}
  C2 -->|"yes"| F1
  C2 -->|"no, or unsure"| C3["Stop and ask: clause 12 quote first.<br/>Record it under New scope"]

  Q -->|"Something is broken"| B1["verification-log.md: when it last passed"]
  B1 --> B2["completed.md: what changed since"]
  B2 --> B3["scripts/verify/: rerun the check"]

  Q -->|"Review a pull request"| R1["docs/review-checklist.md"]
  R1 --> R2["The PR body's Claims"]
  R2 --> R3["CONTEXT.md is true after the change"]

  Q -->|"Status for the owner or Client"| S1["CONTEXT.md: Status and External blockers"]
```

## 3. The route every piece of work takes

```mermaid
flowchart TD
  A["Session starts:<br/>CLAUDE.md and ../CLAUDE.md load"] --> B["Read CONTEXT.md in full"]
  B --> C["Read the docs/context/ file for your area"]
  C --> D["git status, branch, recent commits:<br/>the repository beats the file"]
  D --> E["Claim it: a row in Active work<br/>branch, scope, files you own"]
  E --> W["Own branch: scripts/wt-new.sh NAME PORT<br/>for parallel work, never commit to main"]
  W --> G["Build inside your slice"]

  G --> G1["New table: RLS for reads AND writes,<br/>same migration"]
  G --> G2["New screen: its own loading.tsx"]
  G --> G3["New dependency or src/shared change:<br/>stop and ask"]

  G1 & G2 & G3 --> H["npm run typecheck, lint, test, build"]
  H --> I["Prove it works: scripts/verify/ against a<br/>running build and the hosted database.<br/>Throwaway accounts, counts back to baseline"]
  I --> J["Update context: CONTEXT.md now;<br/>write-up and log rows in docs/context/"]
  J --> K["node scripts/check-context.mjs"]
  K --> L["PR: what, tables touched, Claims, look-at-carefully"]
  L --> M{"CI: verify, context,<br/>Vercel preview"}
  M -->|"fail"| G
  M -->|"pass"| N["Human review, then merge"]
  N --> O["Vercel deploys main"]
  O --> P["Rerun the check against the deployed URL"]
  P --> Q["Move the Active work row to completed.md,<br/>log the deployed result"]
```

| Step | Rule that governs it |
|---|---|
| Read `CONTEXT.md`, then the area's history file | The context rule, in `CLAUDE.md`, `AGENTS.md` and `CONTEXT.md` |
| Claim Active work before the first change | Same rule; check 2 of `scripts/check-context.mjs` fails a claim on a deleted branch |
| Worktrees, ports, one feature each | `../CLAUDE.md` section 5 |
| RLS for writes as well as reads, storage policies per bucket | `../CLAUDE.md` sections 4.3 and 9 |
| A skeleton for every new screen | `CLAUDE.md`, *Every new screen ships with its skeleton* |
| "Should work" is never recorded as "works" | The context rule, and `docs/review-checklist.md` section 4 |
| Schema changes only through migrations, never the Supabase MCP server | `../CLAUDE.md` section 4.5 |

## 4. What enforces it

```mermaid
flowchart LR
  subgraph LOCAL["On your machine"]
    HOOK["Stop hook, .claude/settings.json<br/>runs the context check when a session ends"]
    UT["npm run test<br/>includes loading-coverage.test.ts"]
  end
  subgraph CI["On every pull request"]
    V["verify job:<br/>typecheck, lint, test, build"]
    CX["context job: check-context.mjs"]
    VP["Vercel preview deployment"]
  end
  subgraph HUMAN["People"]
    RV["Reviewer, docs/review-checklist.md"]
    OW["Owner merges"]
  end
  CX --> C1["merged PR described as open,<br/>in CONTEXT.md or docs/context/"]
  CX --> C2["Active work naming a deleted branch"]
  CX --> C3["src/ or supabase/ changed, CONTEXT.md not"]
  CX --> C4["stale Last updated date"]
  UT --> U1["a role page with no loading.tsx of its own"]
  V --> RV --> OW
```

**What CI does not do:** it never runs anything in `scripts/verify/`. A green
`verify` job means the code compiles and the unit tests pass, not that the
database or the deployed application was checked. Those checks are run by hand,
and their results go in `docs/context/verification-log.md`.
