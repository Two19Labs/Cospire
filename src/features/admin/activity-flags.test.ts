import { describe, expect, it } from "vitest";

import {
  MAX_DISTINCT_IPS,
  activityFlags,
  concurrentSessionFlags,
  sessionStretches,
  severalLocationFlags,
  type ActivityEvent,
} from "./activity-flags";

const base = Date.parse("2026-10-08T09:00:00Z");
function at(minutes: number): string {
  return new Date(base + minutes * 60_000).toISOString();
}
function event(sessionId: string, minutes: number, extra: Partial<ActivityEvent> = {}): ActivityEvent {
  return { eventType: "active", ip: "203.0.113.1", occurredAt: at(minutes), sessionId, userId: "u1", ...extra };
}

describe("concurrent sessions", () => {
  it("flags two sessions in use at the same time", () => {
    const flags = concurrentSessionFlags([
      event("a", 0, { eventType: "sign_in" }), event("a", 10), event("a", 20),
      event("b", 15, { eventType: "sign_in" }), event("b", 25),
    ]);
    expect(flags).toEqual([{ firstOverlapAt: at(15), kind: "concurrent_sessions", sessionCount: 2, userId: "u1" }]);
  });

  it("does not flag one session seen many times (two tabs share a session)", () => {
    expect(concurrentSessionFlags([event("a", 0), event("a", 5), event("a", 12)])).toEqual([]);
  });

  it("does not flag a sign-out followed by a new sign-in", () => {
    expect(concurrentSessionFlags([
      event("a", 0, { eventType: "sign_in" }), event("a", 5, { eventType: "sign_out" }),
      event("b", 6, { eventType: "sign_in" }), event("b", 15),
    ])).toEqual([]);
  });

  it("does not flag a session that went idle before the next began", () => {
    expect(concurrentSessionFlags([
      event("a", 0), event("a", 40), // separate stretches, the last ends at 50
      event("b", 60), event("b", 70),
    ])).toEqual([]);
  });

  it("an idle gap does not keep an overnight session alive", () => {
    // a: seen at 0, then not until 600 minutes later. b in between.
    const stretches = sessionStretches([event("a", 0), event("a", 600)]);
    expect(stretches).toHaveLength(2);
    expect(concurrentSessionFlags([event("a", 0), event("b", 300), event("a", 600)])).toEqual([]);
  });

  it("keeps different accounts apart", () => {
    expect(concurrentSessionFlags([event("a", 0), event("b", 1, { userId: "u2" })])).toEqual([]);
  });

  it("ignores rows without a session id", () => {
    expect(concurrentSessionFlags([event("a", 0), { ...event("x", 1), sessionId: null }])).toEqual([]);
  });

  it("counts every overlapping session", () => {
    const flags = concurrentSessionFlags([event("a", 0), event("b", 2), event("c", 4)]);
    expect(flags[0]?.sessionCount).toBe(3);
  });
});

describe("several locations", () => {
  const ips = ["198.51.100.1", "198.51.100.2", "198.51.100.3", "198.51.100.4"];

  it(`flags more than ${MAX_DISTINCT_IPS} distinct addresses`, () => {
    const flags = severalLocationFlags(ips.map((ip, i) => event("a", i, { ip })));
    expect(flags).toEqual([{ ipCount: 4, ips, kind: "several_locations", userId: "u1" }]);
  });

  it(`does not flag ${MAX_DISTINCT_IPS} addresses, repeats or missing ones`, () => {
    const rows = ips.slice(0, 3).flatMap((ip, i) => [event("a", i, { ip }), event("a", i + 5, { ip })]);
    rows.push(event("a", 20, { ip: null }));
    expect(severalLocationFlags(rows)).toEqual([]);
  });
});

describe("activityFlags", () => {
  it("returns both kinds together", () => {
    const rows = [event("a", 0, { ip: "10.0.0.1" }), event("b", 1, { ip: "10.0.0.2" }), event("a", 2, { ip: "10.0.0.3" }), event("b", 3, { ip: "10.0.0.4" })];
    expect(activityFlags(rows).map((flag) => flag.kind)).toEqual(["concurrent_sessions", "several_locations"]);
  });
});
