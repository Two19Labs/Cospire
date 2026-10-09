"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { currentRequestIp, recordActivity } from "../record-activity";

export async function logoutAction() {
  const supabase = await createServerSupabaseClient();
  // The claims are read before the session ends, while they can still be verified.
  // The sign-out row closes the session's stretch in the concurrent-session flag.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId === "string") {
    const sessionId = data?.claims?.session_id;
    const entry = {
      eventType: "sign_out" as const,
      ip: await currentRequestIp(),
      sessionId: typeof sessionId === "string" ? sessionId : null,
      userId,
    };
    after(() => recordActivity(entry));
  }
  await supabase.auth.signOut();
  redirect("/login");
}
