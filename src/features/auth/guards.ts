import "server-only";

import { redirect } from "next/navigation";

import { getCurrentProfile } from "./queries/get-current-profile";
import { roleHomePath, type AppRole, type Profile } from "./types";

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireRole(expectedRole: AppRole): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== expectedRole) redirect(roleHomePath(profile.role));
  return profile;
}
