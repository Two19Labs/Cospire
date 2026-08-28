import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { MentorHome } from "@/features/mentor/components/mentor-home";

export const metadata: Metadata = { title: "Mentor workspace" };

export default async function MentorPage() {
  const profile = await requireRole("mentor");
  return <MentorHome profile={profile} />;
}
