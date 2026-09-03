// The watermark drawn across every rendered page.
//
// Composed here, on the server, from the session profile -- never from anything
// the client sends. Technical brief §7 is explicit about why: client-supplied
// text can be edited to say somebody else's name, and a traceable watermark that
// can be made to name the wrong person is worse than none, because it produces
// confident false attribution.
//
// Pure and unit tested, with the clock passed in, so the format is pinned by a
// test rather than by whatever the machine's locale happened to be.

export interface WatermarkSubject {
  email: string;
  name: string;
}

// IST, and stated as IST.
//
// The requirement an evidence trail actually has is that the instant is
// unambiguous, not that it is UTC. An unlabelled local time fails that; a
// labelled one does not. Everyone who will ever read one of these -- the
// students, the mentors, the admins -- is in India, and asking them to convert
// from UTC to work out when a screenshot was taken is friction with nothing
// bought for it.
//
// Computed by fixed offset rather than through `Intl` with a `timeZone`.
// India is UTC+5:30 and has had no daylight saving since 1945, so the
// arithmetic is exact, and it cannot degrade the way a time-zone lookup can: a
// runtime with trimmed ICU data silently falls back to UTC while still printing
// "IST", which is a wrong answer that looks right. Vercel runs on UTC, so this
// has to be correct without depending on the server's clock settings.
const istOffsetMinutes = 5 * 60 + 30;

function formatViewedAt(viewedAt: Date): string {
  const ist = new Date(viewedAt.getTime() + istOffsetMinutes * 60_000);
  // Read back through the UTC getters, which is what makes the shift above the
  // only time-zone arithmetic involved. The local getters would add the
  // machine's own offset on top.
  const iso = ist.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} IST`;
}

export function composeWatermark({
  subject,
  viewedAt,
}: {
  subject: WatermarkSubject;
  viewedAt: Date;
}): string {
  const name = subject.name.trim();
  const email = subject.email.trim();
  const stamp = formatViewedAt(viewedAt);

  // Name as well as address, because the address alone is the part a reader
  // skims past, and both together make a screenshot self-explanatory.
  return name ? `${name} · ${email} · ${stamp}` : `${email} · ${stamp}`;
}
