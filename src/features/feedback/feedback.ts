// The feedback board has no login. Two long random codes, kept in the server's
// environment, are the whole of its access control: one for the Client's link,
// one for the owner's. Anyone holding a link can use it; changing the code in
// the environment kills the old link.

export type FeedbackMode = "client" | "owner";

export const statuses = ["new", "discussing", "planned", "done", "out_of_scope"] as const;
export type FeedbackStatus = (typeof statuses)[number];
export const statusLabels: Record<FeedbackStatus, string> = {
  discussing: "Discussing",
  done: "Done",
  new: "New",
  out_of_scope: "Out of scope",
  planned: "Planned",
};

export const maxScreenshots = 5;
export const maxScreenshotBytes = 5 * 1024 * 1024;
export const imageTypes: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Compared in constant time, and in plain JavaScript: this module is also
// imported by the browser form for its limits, where `node:crypto` cannot load.
function same(a: string, b: string | undefined): boolean {
  // A code shorter than 24 characters is treated as not configured, so an
  // empty or lazy value in the environment can never open the page.
  if (!b || b.length < 24) return false;
  let difference = a.length ^ b.length;
  for (let i = 0; i < b.length; i += 1) difference |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
  return difference === 0;
}

export function modeFor(code: string, env: { client?: string; owner?: string }): FeedbackMode | null {
  if (same(code, env.owner)) return "owner";
  if (same(code, env.client)) return "client";
  return null;
}

const screenshotPath = /^thoughts\/[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;

export interface NewThought {
  authorName: string | null;
  body: string;
  screenshots: string[];
  title: string;
  urgent: boolean;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= max ? trimmed : null;
}

// Everything on this page comes from a visitor nobody has identified, so every
// field is checked here, on the server, before it reaches the database.
export function parseThought(input: unknown): NewThought | string {
  if (typeof input !== "object" || input === null) return "That could not be read. Reload and try again.";
  const raw = input as Record<string, unknown>;
  const title = text(raw.title, 200);
  if (!title) return "Give it a title, up to 200 characters.";
  const body = text(raw.body, 5000);
  if (!body) return "Write the thought, up to 5,000 characters.";
  const name = typeof raw.authorName === "string" && raw.authorName.trim() ? text(raw.authorName, 80) : null;
  if (raw.authorName && typeof raw.authorName === "string" && raw.authorName.trim() && !name) return "Keep the name under 80 characters.";
  const shots = raw.screenshots ?? [];
  if (!Array.isArray(shots) || shots.length > maxScreenshots || !shots.every((p) => typeof p === "string" && screenshotPath.test(p))) {
    return `Attach up to ${maxScreenshots} screenshots.`;
  }
  return { authorName: name, body, screenshots: shots as string[], title, urgent: raw.urgent === true };
}

export function parseStatus(value: unknown): FeedbackStatus | null {
  return statuses.find((status) => status === value) ?? null;
}
