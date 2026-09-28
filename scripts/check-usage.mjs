#!/usr/bin/env node
// How much of this agent's allowance is left, and whether it is time to hand off.
//
//   node scripts/check-usage.mjs            # human-readable
//   node scripts/check-usage.mjs --json     # for a script to read
//   node scripts/check-usage.mjs --threshold 10
//
// Exit codes, so a shell can branch on it without parsing anything:
//
//   0  above the threshold, keep working
//   1  at or below it -- stop, write the handoff, tell the owner
//   2  could not be determined
//
// **2 is not 0.** An agent that cannot read its usage must say so and keep a
// human in the loop, never assume it has room. A checker that fails open is
// worse than no checker, because it turns "I do not know" into "carry on" at
// exactly the moment that is most expensive.
//
// ---------------------------------------------------------------------------
// What this reads, and the caveat that comes with it
// ---------------------------------------------------------------------------
//
// Claude Code has no official usage command -- there are open feature requests
// asking for one. What it does have is an OAuth token in
// `~/.claude/.credentials.json`, and an **undocumented** endpoint,
// `api.anthropic.com/api/oauth/usage`, which answers with the utilisation of
// the five-hour and seven-day windows and when each resets.
//
// Undocumented means it may change or vanish without notice. That is why this
// exits 2 rather than 0 on anything unexpected: the day the endpoint changes
// shape, every agent is told it does not know, rather than told it is fine.
//
// **The token is a secret.** It is read into memory, sent to Anthropic and
// nowhere else, and never printed, logged or written to disk. Nothing this
// prints contains it.
//
// ---------------------------------------------------------------------------
// One implementation note, because it cost a defect
// ---------------------------------------------------------------------------
//
// Do not call `process.exit()` here. Calling it while `fetch`'s sockets are
// still closing trips a libuv assertion on Windows --
// `!(handle->flags & UV_HANDLE_CLOSING)` -- and the process dies with **127**,
// which is neither 0 nor 1 nor 2. Every caller branching on the exit code then
// reads a perfectly good answer as a crash. So this sets `process.exitCode` and
// lets the process end on its own.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const endpoint = "https://api.anthropic.com/api/oauth/usage";
const credentialsPath = join(homedir(), ".claude", ".credentials.json");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const thresholdIndex = args.indexOf("--threshold");
// The owner's rule, 2026-09-26: below 7% remaining, stop and hand off.
const threshold = thresholdIndex >= 0 ? Number(args[thresholdIndex + 1]) : 7;

function unknown(reason) {
  return { code: 2, result: { error: reason, handOff: null } };
}

async function check() {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    return unknown("--threshold takes a number between 0 and 100");
  }

  let token;
  try {
    token = JSON.parse(readFileSync(credentialsPath, "utf8"))?.claudeAiOauth?.accessToken;
  } catch (cause) {
    return unknown(`could not read ${credentialsPath}: ${cause.message}`);
  }
  if (!token) {
    return unknown("no Claude OAuth token in the credentials file; sign in with `claude` first");
  }

  let payload;
  try {
    const response = await fetch(endpoint, {
      headers: {
        authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status === 401 || response.status === 403) {
      return unknown("the OAuth token was refused; run `claude` once to refresh it");
    }
    if (response.status === 429) {
      // The usage endpoint has a rate limit of its own, and calling it in a
      // loop trips it -- five calls inside a minute was enough. This is a
      // reason to check at checkpoints rather than continuously, and a reason
      // never to treat an unanswered check as permission to carry on.
      return unknown("the usage endpoint is rate-limited right now; it is checked too often, wait a minute");
    }
    if (!response.ok) {
      return unknown(`the usage endpoint answered ${response.status}`);
    }
    payload = await response.json();
  } catch (cause) {
    return unknown(`the usage endpoint could not be reached: ${cause.message}`);
  }

  // `utilization` is the percentage **used**, so remaining is its complement.
  // Only the two windows that bound ordinary work are read; the payload carries
  // other keys, usually null, which are none of this rule's business.
  const windows = [
    { key: "five_hour", name: "five-hour" },
    { key: "seven_day", name: "weekly" },
  ]
    .map(({ key, name }) => {
      const raw = payload?.[key];
      if (!raw || typeof raw.utilization !== "number") return null;
      return {
        name,
        remaining: Math.round((100 - raw.utilization) * 10) / 10,
        resetsAt: raw.resets_at ?? null,
        utilization: raw.utilization,
      };
    })
    .filter(Boolean);

  if (windows.length === 0) {
    return unknown("the usage endpoint answered in a shape this script does not recognise");
  }

  // The owner's rule of 2026-09-26: whichever window is lowest decides.
  const lowest = windows.reduce((a, b) => (a.remaining <= b.remaining ? a : b));
  const handOff = lowest.remaining <= threshold;

  return { code: handOff ? 1 : 0, result: { handOff, lowest, threshold, windows } };
}

const { code, result } = await check();

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.error) {
  console.log(`usage: UNKNOWN -- ${result.error}`);
} else {
  for (const window of result.windows) {
    const resets = window.resetsAt ? ` (resets ${window.resetsAt.slice(0, 16).replace("T", " ")} UTC)` : "";
    console.log(`${window.name.padEnd(10)} ${String(window.remaining).padStart(5)}% left${resets}`);
  }
  console.log(
    result.handOff
      ? `\nHAND OFF. ${result.lowest.name} is at ${result.lowest.remaining}% remaining, at or below the ${threshold}% threshold.`
      : `\nKeep working. Lowest window is ${result.lowest.name} at ${result.lowest.remaining}% remaining.`,
  );
}

process.exitCode = code;
