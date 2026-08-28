import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { StudentHome } from "@/features/student/components/student-home";

export const metadata: Metadata = { title: "My learning" };

export default async function StudentPage() {
  const profile = await requireRole("student");
  return <StudentHome profile={profile} />;
}
