import "server-only";

import { redirect } from "next/navigation";

import { requireProfile } from "@/features/auth/guards";
import { roleHomePath, type Profile } from "@/features/auth/types";

// Annexure A: "Question authoring by admins and mentors". The shared guard
// takes one role, and the bank has two, so this is the feature's own check.
// It is a courtesy redirect only; `private.is_author_of_org` in the policies is
// what decides.
export async function requireAuthor(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin" && profile.role !== "mentor") redirect(roleHomePath(profile.role));
  return profile;
}
