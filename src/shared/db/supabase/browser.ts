"use client";

import { createBrowserClient } from "@supabase/ssr";

import { requirePublicSupabaseConfig } from "./config";

export function createBrowserSupabaseClient() {
  const { publishableKey, url } = requirePublicSupabaseConfig();
  return createBrowserClient(url, publishableKey);
}
