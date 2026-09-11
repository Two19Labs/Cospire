#!/usr/bin/env node
// Refuses to let CONTEXT.md contradict reality.
//
// The context rule is stated three times in this repository -- in CLAUDE.md, in
// AGENTS.md and inside CONTEXT.md itself -- as forcefully as prose can manage.
// On 2026-09-08 CONTEXT.md was still found describing a pull request as open
// two days after it merged, and nine further statements had gone stale from the
// same event. So a fourth, sterner paragraph is the one remedy already known
// not to work, and this file exists instead.
//
// It checks facts, never wording. Each check below maps to a mistake that
// actually happened rather than one that might: guessing at failure modes is
// how a gate grows until people route around it.
//
// Run it anywhere: `node scripts/check-context.mjs`. It needs no dependencies
// and no database.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const contextPath = "CONTEXT.md";
const problems = [];
const skipped = [];

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const context = readFileSync(contextPath, "utf8");
const lines = context.split(/\r?\n/);

// The base to compare against. On a pull request the runner checks out a merge
// ref, so origin/main is the honest base; locally it is the same thing.
const baseRef = git(["rev-parse", "--verify", "--quiet", "origin/main"])
  ? "origin/main"
  : "";

// ---------------------------------------------------------------------------
// 1. A pull request described as open that GitHub says is merged.
//
// This is the exact break of 2026-09-08 and the only check here that needed a
// network call to catch. It is worth the call.
// ---------------------------------------------------------------------------

const openWords =
  /\b(open|unmerged|awaiting merge|awaiting review|in review|needs merging|not yet merged|pending merge)\b/i;

// The claim and the pull request number are not always on the same line.
//
// On 2026-09-10 this check passed over "is in **PR #21**," followed by "open"
// on the next line, because the word making the claim had wrapped. Three stale
// statements reached `main` as a result. A missed staleness is worse than a
// false positive here: the whole point is that nobody has to remember.
//
// So the paragraph is unwrapped and then cut back to the *sentence* holding the
// mention. The paragraph alone is too wide: "step 2 is in PR #21, open" and
// "step 1 merged in PR #19" routinely sit together, and scanning the paragraph
// convicted #19 of #21's word. Table rows are exempt and read alone -- a row is
// self-contained, and joining a table would let one row's "open" convict its
// neighbour.
function claimText(index, number) {
  const isRow = (line) => line.trimStart().startsWith("|");
  if (isRow(lines[index])) return lines[index];

  let start = index;
  while (start > 0 && lines[start - 1].trim() !== "" && !isRow(lines[start - 1])) {
    start -= 1;
  }

  let end = index;
  while (end < lines.length - 1 && lines[end + 1].trim() !== "" && !isRow(lines[end + 1])) {
    end += 1;
  }

  const paragraph = lines.slice(start, end + 1).join(" ");
  // Escaped twice on purpose: inside a template literal `\b` is a backspace,
  // not a word boundary, and the first version of this line matched nothing.
  const mention = new RegExp(`\\bPR #${number}\\b`);

  // Split on a full stop followed by whitespace. Crude, and deliberately so: a
  // sentence wrongly joined to its neighbour only widens the search, which errs
  // towards reporting rather than towards silence.
  const sentences = paragraph.split(/(?<=\.)\s+/);
  const holding = sentences.filter((sentence) => mention.test(sentence));

  return holding.length > 0 ? holding.join(" ") : paragraph;
}

function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = git(["remote", "get-url", "origin"]);
  const match = url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
  return match ? match[1] : null;
}

async function fetchPrState(slug, number, token) {
  const response = await fetch(
    `https://api.github.com/repos/${slug}/pulls/${number}`,
    {
      headers: {
        accept: "application/vnd.github+json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    },
  );
  if (!response.ok) return null;
  const body = await response.json();
  return body.merged_at ? "MERGED" : String(body.state ?? "").toUpperCase();
}

async function checkPullRequests() {
  const mentions = new Map();
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/\bPR #(\d+)/g)) {
      const number = match[1];
      if (!mentions.has(number)) mentions.set(number, []);
      mentions
        .get(number)
        .push({ claim: claimText(index, number), line, number: index + 1 });
    }
  });

  if (mentions.size === 0) return;

  const slug = repoSlug();
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? "";

  if (!slug) {
    skipped.push("pull request states: no GitHub remote found");
    return;
  }

  for (const [number, occurrences] of mentions) {
    // Only the lines that make a claim about merge state are worth a call.
    const claiming = occurrences.filter((o) => openWords.test(o.claim));
    if (claiming.length === 0) continue;

    let state;
    try {
      state = await fetchPrState(slug, number, token);
    } catch {
      state = null;
    }

    if (state === null) {
      skipped.push(
        `PR #${number}: could not reach the GitHub API (unauthenticated or rate limited)`,
      );
      continue;
    }

    if (state === "MERGED") {
      for (const occurrence of claiming) {
        problems.push(
          `${contextPath}:${occurrence.number} calls PR #${number} open, but it is merged.\n` +
            `    ${occurrence.line.trim().slice(0, 140)}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Active work naming a branch that no longer exists.
//
// A claimed branch that is gone means either the work landed and the claim was
// never cleared, or someone is about to collide with a ghost.
// ---------------------------------------------------------------------------

function checkActiveWorkBranches() {
  const start = lines.findIndex((line) => /^##\s+Active work/i.test(line));
  if (start === -1) {
    problems.push(`${contextPath} has no "Active work" section.`);
    return;
  }

  const end = lines.findIndex(
    (line, index) => index > start && /^##\s+/.test(line),
  );

  for (let i = start; i < (end === -1 ? lines.length : end); i += 1) {
    const line = lines[i];
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    // | owner | branch | scope | ... -- cells[0] is the empty string before the
    // leading pipe, so the branch is cells[2].
    const branchCell = cells[2] ?? "";
    if (!branchCell || branchCell === "-" || /^branch$/i.test(branchCell)) {
      continue;
    }
    if (/^-+$/.test(branchCell)) continue;

    const name = branchCell.replace(/`/g, "").trim();
    if (!name || name === "-") continue;

    const exists = git(["ls-remote", "--heads", "origin", name]);
    if (!exists) {
      problems.push(
        `${contextPath}:${i + 1} Active work claims branch \`${name}\`, which does not exist on origin.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Code changed without the context changing.
//
// This is the check that answers "why do I keep having to ask whether it was
// updated". It makes the answer structural rather than a matter of anyone
// remembering.
//
// Escape hatch: a commit message trailer `Context-Exempt: <reason>`. Deliberately
// a trailer rather than a label, so the reason travels with the history and is
// visible in `git log` after handover.
// ---------------------------------------------------------------------------

function checkContextAccompaniesCode() {
  if (!baseRef) {
    skipped.push("context-accompanies-code: no origin/main to compare against");
    return;
  }

  const range = `${baseRef}...HEAD`;
  const changed = git(["diff", "--name-only", range]).split("\n").filter(Boolean);

  if (changed.length === 0) return;

  const touchesCode = changed.some(
    (file) => file.startsWith("src/") || file.startsWith("supabase/"),
  );
  if (!touchesCode) return;
  if (changed.includes(contextPath)) return;

  const messages = git(["log", "--format=%B", range]);
  if (/^Context-Exempt:/im.test(messages)) return;

  problems.push(
    `${changed.filter((f) => f.startsWith("src/") || f.startsWith("supabase/")).length} file(s) under src/ or supabase/ changed, but ${contextPath} did not.\n` +
      `    Record what changed, what you verified, and what is still open.\n` +
      `    If this genuinely needs no context change, say why in a commit trailer:\n` +
      `      Context-Exempt: <reason>`,
  );
}

// ---------------------------------------------------------------------------
// 4. A "Last updated" date older than the newest change to the file.
//
// Cheap, and it catches the edit that changes a paragraph while leaving the
// header claiming the file was last touched a week ago.
// ---------------------------------------------------------------------------

function checkLastUpdated() {
  const stated = context.match(/^Last updated:\s*(\d{4}-\d{2}-\d{2})/m);
  if (!stated) {
    problems.push(`${contextPath} has no "Last updated: YYYY-MM-DD" line.`);
    return;
  }

  const committed = git([
    "log",
    "-1",
    "--format=%cI",
    "--",
    contextPath,
  ]);
  if (!committed) return;

  // Compared in Asia/Calcutta, which is the time zone the file states its dates
  // in. Comparing in UTC would report a false failure for anything written
  // after 05:30 local on the day it was committed.
  const committedDay = new Date(
    new Date(committed).getTime() + (5 * 60 + 30) * 60_000,
  )
    .toISOString()
    .slice(0, 10);

  if (stated[1] < committedDay) {
    problems.push(
      `${contextPath} says "Last updated: ${stated[1]}" but was last committed on ${committedDay}.`,
    );
  }
}

// ---------------------------------------------------------------------------

await checkPullRequests();
checkActiveWorkBranches();
checkContextAccompaniesCode();
checkLastUpdated();

for (const note of skipped) console.log(`skipped  ${note}`);

if (problems.length === 0) {
  console.log(`ok       ${contextPath} agrees with the repository.`);
  process.exit(0);
}

console.error(`\n${contextPath} contradicts the repository:\n`);
for (const problem of problems) console.error(`  - ${problem}\n`);
console.error(
  "The context rule is in CLAUDE.md and AGENTS.md. Correct the file rather\n" +
    "than appending beneath the stale statement: a file that contradicts itself\n" +
    "is worse than one that is merely out of date.\n",
);
process.exit(1);
