import "server-only";

// The VdoCipher API, called from the server only. The API secret is read from
// `VDOCIPHER_API_SECRET` here and nowhere else; it never reaches a client
// component, a response or a log (operating manual §9.1-9.2).
//
// Request and response shapes from VdoCipher's docs, checked 2026-10-13:
// https://www.vdocipher.com/docs/server/playbackauth/otp/ (OTP),
// .../playbackauth/anno (watermark), .../upload/status (video details),
// .../upload/credentials (upload).

const apiBase = "https://dev.vdocipher.com/api";

// An OTP opens playback, so it lives just long enough to start the player.
export const otpTtlSeconds = 300;

export type VideoStatus = "pre_upload" | "processing" | "ready";

export interface VideoInfo {
  durationSeconds: number | null;
  status: VideoStatus;
  title: string;
}

export interface Playback {
  otp: string;
  playbackInfo: string;
}

export interface UploadCredentials {
  clientPayload: Record<string, string>;
  videoId: string;
}

export function isVdocipherId(raw: unknown): raw is string {
  return typeof raw === "string" && /^[0-9a-f]{32}$/.test(raw);
}

// VdoCipher reports "Pre-Upload", "Queued" and "ready". Anything that is not
// one of the two ends is still in VdoCipher's hands.
export function parseVideoStatus(raw: unknown): VideoStatus {
  if (raw === "ready") return "ready";
  if (raw === "Pre-Upload") return "pre_upload";
  return "processing";
}

function secret(): string {
  const value = process.env.VDOCIPHER_API_SECRET;
  if (!value) throw new Error("VDOCIPHER_API_SECRET is not configured.");
  return value;
}

function headers(apiSecret: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Apisecret ${apiSecret}`,
    "Content-Type": "application/json",
  };
}

// Pure, so the request is pinned by a test. `annotate` is a JSON string inside
// the JSON body: VdoCipher's docs call this out as "extra serialisation".
// `rtext` is the moving watermark, repositioned every `interval` ms.
export function buildOtpRequest({
  apiSecret,
  vdocipherId,
  watermark,
}: {
  apiSecret: string;
  vdocipherId: string;
  watermark: string;
}): { init: RequestInit; url: string } {
  if (!isVdocipherId(vdocipherId)) throw new Error("Not a VdoCipher video id.");
  return {
    init: {
      body: JSON.stringify({
        annotate: JSON.stringify([
          { alpha: "0.60", color: "0xFFFFFF", interval: "5000", size: "15", text: watermark, type: "rtext" },
        ]),
        ttl: otpTtlSeconds,
      }),
      headers: headers(apiSecret),
      method: "POST",
    },
    url: `${apiBase}/videos/${vdocipherId}/otp`,
  };
}

async function call(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  // The status only: VdoCipher's error body is not ours to put on a page.
  if (!response.ok) throw new Error(`VdoCipher answered ${response.status}.`);
  return (await response.json()) as Record<string, unknown>;
}

// Call ONLY after the database has said the viewer may watch this video.
export async function requestOtp(vdocipherId: string, watermark: string): Promise<Playback> {
  const { init, url } = buildOtpRequest({ apiSecret: secret(), vdocipherId, watermark });
  const body = await call(url, init);
  if (typeof body.otp !== "string" || typeof body.playbackInfo !== "string") {
    throw new Error("VdoCipher returned no OTP.");
  }
  return { otp: body.otp, playbackInfo: body.playbackInfo };
}

export async function fetchVideoInfo(vdocipherId: string): Promise<VideoInfo> {
  if (!isVdocipherId(vdocipherId)) throw new Error("Not a VdoCipher video id.");
  const body = await call(`${apiBase}/videos/${vdocipherId}`, {
    headers: headers(secret()),
    method: "GET",
  });
  const length = Number(body.length);
  return {
    durationSeconds: Number.isFinite(length) && length > 0 ? Math.round(length) : null,
    status: parseVideoStatus(body.status),
    title: typeof body.title === "string" ? body.title : "",
  };
}

// Removes the video from VdoCipher itself (D42). Called only after the database
// half of the delete has committed, and the `deletion_cleanups` row it leaves
// behind is what makes a failure here visible instead of silent.
// `DELETE /videos?videos=<id>`, the call `video-upload-live.mjs` already uses.
export async function deleteVideo(vdocipherId: string): Promise<void> {
  if (!isVdocipherId(vdocipherId)) throw new Error("Not a VdoCipher video id.");
  await call(`${apiBase}/videos?videos=${vdocipherId}`, {
    headers: headers(secret()),
    method: "DELETE",
  });
}

// Upload credentials: the browser then posts the file straight to VdoCipher's
// storage with `clientPayload`, so no video byte passes through our server
// (manual §8).
export async function createUploadCredentials(title: string): Promise<UploadCredentials> {
  const body = await call(`${apiBase}/videos?title=${encodeURIComponent(title)}`, {
    headers: headers(secret()),
    method: "PUT",
  });
  const payload = body.clientPayload as Record<string, unknown> | undefined;
  if (!isVdocipherId(body.videoId) || !payload || typeof payload.uploadLink !== "string") {
    throw new Error("VdoCipher returned no upload credentials.");
  }
  const clientPayload: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") clientPayload[key] = value;
  }
  return { clientPayload, videoId: body.videoId };
}
