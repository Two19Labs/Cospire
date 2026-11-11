import "server-only";

import { createAdminSupabaseClient } from "@/shared/db/supabase/admin";

import { modeFor, type FeedbackMode, type FeedbackStatus, type NewThought } from "./feedback";

// The one place the feedback table and bucket are touched. Nobody is signed in
// on these pages, so there is no session for RLS to judge: the table has no
// policies and the secret-key client is the only way in. Every caller must
// have checked the link's code with `feedbackMode` first.

export const feedbackBucket = "feedback";

export interface Thought {
  authorName: string | null;
  body: string;
  createdAt: string;
  id: number;
  repliedAt: string | null;
  reply: string | null;
  screenshots: string[];
  status: FeedbackStatus;
  title: string;
  urgent: boolean;
}

export function feedbackMode(code: string): FeedbackMode | null {
  return modeFor(code, { client: process.env.FEEDBACK_CLIENT_CODE, owner: process.env.FEEDBACK_OWNER_CODE });
}

const columns = "id, title, body, urgent, author_name, screenshots, status, reply, replied_at, created_at";

// Newest first, with each screenshot as a link that works for ten minutes.
// ponytail: one page of 200; add paging if the board ever outgrows it.
export async function listThoughts(): Promise<Thought[]> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.from("feedback_thoughts").select(columns).order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(`Unable to read the feedback board: ${error.message}`);
  const rows = data ?? [];
  const paths = rows.flatMap((row) => row.screenshots as string[]);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await supabase.storage.from(feedbackBucket).createSignedUrls(paths, 600);
    for (const entry of urls ?? []) if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
  }
  return rows.map((row) => ({
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    id: row.id,
    repliedAt: row.replied_at,
    reply: row.reply,
    screenshots: (row.screenshots as string[]).flatMap((path) => signed.get(path) ?? []),
    status: row.status,
    title: row.title,
    urgent: row.urgent,
  }));
}

// The page is open to anyone holding the link, so the board refuses more than
// twenty new thoughts an hour. That also bounds the notification emails, which
// share Resend's daily allowance with student invitations.
// ponytail: a global cap, not per visitor; rotate the code if the link is abused.
export async function boardIsFull(): Promise<boolean> {
  const supabase = createAdminSupabaseClient();
  const { count, error } = await supabase
    .from("feedback_thoughts")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  return Boolean(error) || (count ?? 0) >= 20;
}

export async function insertThought(thought: NewThought): Promise<number | null> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("feedback_thoughts")
    .insert({ author_name: thought.authorName, body: thought.body, screenshots: thought.screenshots, title: thought.title, urgent: thought.urgent })
    .select("id")
    .single();
  return error || !data ? null : (data.id as number);
}

export async function answerThought(id: number, status: FeedbackStatus, reply: string | null): Promise<boolean> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("feedback_thoughts")
    .update({ replied_at: reply ? new Date().toISOString() : null, reply, status })
    .eq("id", id)
    .select("id");
  return !error && (data?.length ?? 0) === 1;
}

export async function signUpload(path: string): Promise<string | null> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.storage.from(feedbackBucket).createSignedUploadUrl(path);
  return error || !data?.token ? null : data.token;
}

// Best effort: a thought is saved whether or not the email goes. Sent through
// Resend's HTTP API with the key the Auth emails already use.
export async function notifyOwner(thought: NewThought): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_NOTIFY_EMAIL;
  if (!key || !to) return;
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/feedback/${process.env.FEEDBACK_OWNER_CODE ?? ""}`;
  try {
    await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({
        from: "Cospire <noreply@cospire.in>",
        subject: `${thought.urgent ? "[Urgent] " : ""}New thought: ${thought.title}`,
        text: `${thought.authorName ?? "Someone"} wrote:\n\n${thought.body}\n\n${thought.screenshots.length} screenshot(s).\n\nAnswer it: ${link}`,
        to,
      }),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // The board itself is the record; a lost email loses nothing.
  }
}
