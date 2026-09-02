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

// UTC, and stated as UTC. A student in Mumbai and a reviewer reading a
// screenshot months later need the same instant to mean the same thing, and an
// unlabelled local time in an evidence trail is worth very little.
function formatViewedAt(viewedAt: Date): string {
  const iso = viewedAt.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
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
