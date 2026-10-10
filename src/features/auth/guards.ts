import "server-only";

import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getSessionState } from "./queries/get-current-profile";
import { currentRequestIp, recordActivity } from "./record-activity";
import { roleHomePath, type AppRole, type Profile } from "./types";

// One `active` row per request at most, however many times the layout and the
// page ask for the profile, and written after the response so it never slows a
// page. The database throttles it further to once per session, address and ten
// minutes.
//
// A link prefetch is not activity: the router fires one per visible nav link on
// every page load, and each one paid a `record_activity` round trip for a row
// the database's throttle then discarded (measured 2026-10-09: eleven extra
// calls per admin page view). The page view itself still records.
const noteActive = cache(async (userId: string, sessionId: string | null) => {
  if ((await headers()).get("next-router-prefetch")) return;
  const ip = await currentRequestIp();
  after(() => recordActivity({ eventType: "active", ip, sessionId, userId }));
});

export async function requireProfile(): Promise<Profile> {
  const session = await getSessionState();

  // An authenticated user with no active profile is sent through a route that
  // ends their session and explains why, rather than back to a sign-in screen
  // their correct credentials will never get them past.
  if (session.status === "orphaned") redirect("/auth/no-access");
  if (session.status === "anonymous") redirect("/login");

  await noteActive(session.profile.id, session.sessionId);
  return session.profile;
}

export async function requireRole(expectedRole: AppRole): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== expectedRole) redirect(roleHomePath(profile.role));
  return profile;
}
