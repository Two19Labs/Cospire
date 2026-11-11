"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { imageTypes, parseStatus, parseThought } from "./feedback";
import { answerThought, boardIsFull, feedbackMode, insertThought, notifyOwner, signUpload } from "./store";

// Server Actions are public endpoints, and these have no session behind them:
// each one checks the link's code itself before doing anything.

const closed = "This link is not valid any more.";
const full = "A lot has been logged in the last hour. Try again a little later.";

// Step one of an upload: a short-lived ticket for one image, so the bytes go
// from the browser straight to storage and never through this server.
export async function feedbackUploadTicketAction(code: string, type: string): Promise<{ error: string } | { path: string; token: string }> {
  if (!feedbackMode(code)) return { error: closed };
  const extension = imageTypes[type];
  if (!extension) return { error: "Screenshots must be PNG, JPEG, GIF or WebP images." };
  if (await boardIsFull()) return { error: full };
  const path = `thoughts/${randomUUID()}.${extension}`;
  const token = await signUpload(path);
  return token ? { path, token } : { error: "The screenshot could not be uploaded. Try again." };
}

export async function addThoughtAction(code: string, input: unknown): Promise<{ error: string } | { ok: true }> {
  if (!feedbackMode(code)) return { error: closed };
  const thought = parseThought(input);
  if (typeof thought === "string") return { error: thought };
  if (await boardIsFull()) return { error: full };
  if ((await insertThought(thought)) === null) return { error: "That could not be saved. Try again." };
  await notifyOwner(thought);
  revalidatePath(`/feedback/${code}`);
  return { ok: true };
}

// The owner's link only: a status and one answer per thought.
export async function answerThoughtAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "");
  if (feedbackMode(code) !== "owner") redirect("/login");
  const id = Number(formData.get("id"));
  const status = parseStatus(formData.get("status"));
  const reply = String(formData.get("reply") ?? "").trim().slice(0, 5000) || null;
  const ok = Number.isInteger(id) && id > 0 && status !== null && (await answerThought(id, status, reply));
  redirect(`/feedback/${code}?notice=${ok ? "saved" : "failed"}#thought-${id}`);
}
