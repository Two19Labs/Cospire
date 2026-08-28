import "server-only";

import { redirect } from "next/navigation";

import { getSessionState } from "./queries/get-current-profile";
import { roleHomePath, type AppRole, type Profile } from "./types";

export async function requireProfile(): Promise<Profile> {
  const session = await getSessionState();

  // An authenticated user with no active profile is sent through a route that
  // ends their session and explains why, rather than back to a sign-in screen
  // their correct credentials will never get them past.
  if (session.status === "orphaned") redirect("/auth/no-access");
  if (session.status === "anonymous") redirect("/login");

  return session.profile;
}

export async function requireRole(expectedRole: AppRole): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== expectedRole) redirect(roleHomePath(profile.role));
  return profile;
}
