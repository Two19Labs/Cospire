// Pure rules for the video library, kept out of the `server-only` modules so a
// unit test can reach them.

export const videosPageSize = 25;

export const videoStatusLabels = {
  pre_upload: "Waiting for upload",
  processing: "Processing",
  ready: "Ready",
} as const;

// Outcomes carried back on `?notice=`, a closed set so a URL can never put
// arbitrary text on the page.
export const videoMessages = {
  added: { error: false, text: "Video added to the library." },
  "add-failed": { error: true, text: "That video could not be added. Check the id; it may already be in the library." },
  "bad-id": { error: true, text: "A VdoCipher video id is 32 letters and digits, from the VdoCipher dashboard." },
  "not-found": { error: true, text: "VdoCipher does not know that video id, or the API secret is not set." },
  refreshed: { error: false, text: "Status refreshed from VdoCipher." },
  "refresh-failed": { error: true, text: "VdoCipher could not be reached. Nothing changed." },
  "upload-ready": { error: false, text: "Upload finished. VdoCipher is processing it; refresh its status in a few minutes." },
} as const;

export type VideoMessage = keyof typeof videoMessages;

export function parseVideoMessage(raw: unknown): VideoMessage | null {
  return typeof raw === "string" && Object.hasOwn(videoMessages, raw) ? (raw as VideoMessage) : null;
}

// "00:07:05" from 425, or "—" before VdoCipher has reported a length.
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

// A video counts as watched at 90%: the closing seconds are usually credits.
export const watchedPercent = 90;

// The next item_progress values from a reported position. Percent never goes
// down, so rewatching the opening does not undo progress, and completion is
// one-way, as for documents and readings. `duration` is the stored length,
// never the browser's.
export function planVideoProgress(
  existing: { completed: boolean; percent: number } | null,
  positionSeconds: number,
  durationSeconds: number | null,
): { completed: boolean; lastPosition: number; percent: number } {
  const position = Math.max(0, Math.floor(positionSeconds));
  const lastPosition = durationSeconds ? Math.min(position, durationSeconds) : position;
  const reported = durationSeconds ? Math.min(100, Math.floor((lastPosition / durationSeconds) * 100)) : 0;
  const percent = Math.max(existing?.percent ?? 0, reported);
  return { completed: existing?.completed === true || percent >= watchedPercent, lastPosition, percent };
}
