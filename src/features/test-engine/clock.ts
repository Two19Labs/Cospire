// The attempt clock, read from the server's own timestamps.
//
// The database is what enforces time: it refuses an answer written after these
// deadlines (plus the same grace), whatever a route or a browser says. This file
// only computes the same deadlines so a page can show them. A countdown drawn
// from them is decoration (operating manual §1.1); the student cannot move them.

const minute = 60_000;

// Must match private.attempt_grace() in the 4.1 migration.
export const graceSeconds = 30;

export function attemptDeadline(startedAt: Date, mockMinutes: number): Date {
  return new Date(startedAt.getTime() + mockMinutes * minute);
}

// A timed section ends on its own clock or the paper's, whichever comes first.
// An untimed section follows the paper's clock alone.
export function sectionDeadline(
  sectionStartedAt: Date,
  sectionMinutes: number | null,
  paperDeadline: Date,
): Date {
  if (sectionMinutes === null) return paperDeadline;
  const own = sectionStartedAt.getTime() + sectionMinutes * minute;
  return new Date(Math.min(own, paperDeadline.getTime()));
}

export function secondsLeft(deadline: Date, now: Date): number {
  return Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / 1000));
}

// Past the deadline and the grace: the database will refuse any further answer,
// so the page should stop offering to take one.
export function isOver(deadline: Date, now: Date): boolean {
  return now.getTime() > deadline.getTime() + graceSeconds * 1000;
}
