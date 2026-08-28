import { redirect } from "next/navigation";

import { requireProfile } from "@/features/auth/guards";
import { roleHomePath } from "@/features/auth/types";

export default async function DashboardPage() {
  const profile = await requireProfile();
  redirect(roleHomePath(profile.role));
}
