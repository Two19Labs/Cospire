"use server";

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export async function logoutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
