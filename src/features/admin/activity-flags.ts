// The unusual-activity flags that need no video, as pure functions over
// activity_log rows, so the rules are unit tested without a database.
//
// Both are flags for an admin to look at, never automatic action: a student on
// a phone and a laptop, or on a train, trips them innocently. Annexure B rules
// out webcam and identity checks, so nothing here tries to prove who someone is.

// How far back the admin screen looks.
export const FLAG_WINDOW_HOURS = 24;

// Several locations: more than this many distinct addresses in the window.
// Three covers home, college and a phone on mobile data; a fourth in one day
// is worth a look.
export const MAX_DISTINCT_IPS = 3;

// Must match the interval in public.record_activity: an `active` row is written
// at most once per session and address per this many minutes, so a session
// seen at time t is taken to be live until t plus this.
export const ACTIVE_THROTTLE_MINUTES = 10;

// A session with no row for this long is treated as idle, and a later row
// starts a new stretch. Without it, a laptop left signed in overnight would
// "overlap" with every phone sign-in the next morning.
export const SESSION_IDLE_MINUTES = 30;

export interface ActivityEvent {
  eventType: "active" | "sign_in" | "sign_out";
  ip: string | null;
  occurredAt: string;
  sessionId: string | null;
  userId: string;
}

export interface ConcurrentSessionsFlag {
  firstOverlapAt: string;
  kind: "concurrent_sessions";
  sessionCount: number;
  userId: string;
}

export interface SeveralLocationsFlag {
  ipCount: number;
  ips: string[];
  kind: "several_locations";
  userId: string;
}

export type ActivityFlag = ConcurrentSessionsFlag | SeveralLocationsFlag;

const minute = 60_000;

interface Stretch { end: number; sessionId: string; start: number }

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

// One session's rows as stretches of continuous use: a stretch runs from its
// first row to its last plus the throttle, ends at a sign-out, and breaks
// where rows are more than the idle limit apart.
export function sessionStretches(events: ActivityEvent[]): Stretch[] {
  const stretches: Stretch[] = [];
  for (const [sessionId, rows] of groupBy(events.filter((e) => e.sessionId), (e) => e.sessionId as string)) {
    const sorted = rows.map((row) => ({ ...row, at: Date.parse(row.occurredAt) }))
      .filter((row) => Number.isFinite(row.at))
      .sort((a, b) => a.at - b.at);
    let current: Stretch | null = null;
    let lastAt = 0;
    for (const row of sorted) {
      if (current && row.at - lastAt > SESSION_IDLE_MINUTES * minute) {
        stretches.push(current);
        current = null;
      }
      if (row.eventType === "sign_out") {
        if (current) {
          current.end = row.at;
          stretches.push(current);
          current = null;
        }
        continue;
      }
      if (!current) current = { end: row.at + ACTIVE_THROTTLE_MINUTES * minute, sessionId, start: row.at };
      current.end = row.at + ACTIVE_THROTTLE_MINUTES * minute;
      lastAt = row.at;
    }
    if (current) stretches.push(current);
  }
  return stretches;
}

// Concurrent sessions: two different sessions of one account in use over an
// overlapping stretch of time. Two tabs of one browser share a session, so
// they never trip it.
export function concurrentSessionFlags(events: ActivityEvent[]): ConcurrentSessionsFlag[] {
  const flags: ConcurrentSessionsFlag[] = [];
  for (const [userId, rows] of groupBy(events, (e) => e.userId)) {
    const stretches = sessionStretches(rows).sort((a, b) => a.start - b.start);
    const overlapping = new Set<string>();
    let firstOverlap = Number.POSITIVE_INFINITY;
    for (let i = 0; i < stretches.length; i += 1) {
      for (let j = i + 1; j < stretches.length && stretches[j].start < stretches[i].end; j += 1) {
        if (stretches[i].sessionId === stretches[j].sessionId) continue;
        overlapping.add(stretches[i].sessionId).add(stretches[j].sessionId);
        firstOverlap = Math.min(firstOverlap, stretches[j].start);
      }
    }
    if (overlapping.size > 1) {
      flags.push({ firstOverlapAt: new Date(firstOverlap).toISOString(), kind: "concurrent_sessions", sessionCount: overlapping.size, userId });
    }
  }
  return flags;
}

// Several locations: more than MAX_DISTINCT_IPS distinct addresses for one
// account across the rows given (the caller passes the window).
export function severalLocationFlags(events: ActivityEvent[]): SeveralLocationsFlag[] {
  const flags: SeveralLocationsFlag[] = [];
  for (const [userId, rows] of groupBy(events, (e) => e.userId)) {
    const ips = [...new Set(rows.map((row) => row.ip).filter((ip): ip is string => Boolean(ip)))].sort();
    if (ips.length > MAX_DISTINCT_IPS) flags.push({ ipCount: ips.length, ips, kind: "several_locations", userId });
  }
  return flags;
}

export function activityFlags(events: ActivityEvent[]): ActivityFlag[] {
  return [...concurrentSessionFlags(events), ...severalLocationFlags(events)];
}
