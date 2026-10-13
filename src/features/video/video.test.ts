import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The row RLS would return for the signed-in user; null means "not yours".
let visibleRow: Record<string, unknown> | null = null;
vi.mock("@/shared/db/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: visibleRow, error: null }) }),
      }),
    }),
  }),
}));

const { getVideoPlayback } = await import("./queries/get-video-playback");
const { buildOtpRequest, parseVideoStatus } = await import("./vdocipher");

const id = "0123456789abcdef0123456789abcdef";
const viewer = { email: "s@example.com", id: "u1", name: "Asha Rao", orgId: 1, role: "student" as const };
const viewedAt = new Date("2026-10-13T06:30:00Z");

describe("getVideoPlayback", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VDOCIPHER_API_SECRET", "test-secret");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ otp: "o", playbackInfo: "p" }), { status: 200 }),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("never requests an OTP for a student the database refuses", async () => {
    visibleRow = null;
    expect(await getVideoPlayback({ videoId: 7, viewedAt, viewer })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never requests an OTP for a video that is not ready", async () => {
    visibleRow = { id: 7, status: "processing", title: "T", vdocipher_id: id };
    const view = await getVideoPlayback({ videoId: 7, viewedAt, viewer });
    expect(view?.playback).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests a watermarked OTP once access is granted", async () => {
    visibleRow = { id: 7, status: "ready", title: "T", vdocipher_id: id };
    const view = await getVideoPlayback({ videoId: 7, viewedAt, viewer });
    expect(view?.playback).toEqual({ otp: "o", playbackInfo: "p" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://dev.vdocipher.com/api/videos/${id}/otp`);
    const annotate = JSON.parse(JSON.parse(init.body as string).annotate as string);
    expect(annotate[0].text).toBe("Asha Rao · s@example.com · 2026-10-13 12:00 IST");
  });
});

describe("buildOtpRequest", () => {
  it("posts a short-lived, watermarked OTP request with the secret in the header", () => {
    const { init, url } = buildOtpRequest({ apiSecret: "sec", vdocipherId: id, watermark: "W" });
    expect(url).toBe(`https://dev.vdocipher.com/api/videos/${id}/otp`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Apisecret sec");
    const body = JSON.parse(init.body as string);
    expect(body.ttl).toBe(300);
    // annotate is a JSON string inside the JSON body, per VdoCipher.
    expect(typeof body.annotate).toBe("string");
    expect(JSON.parse(body.annotate)).toEqual([
      { alpha: "0.60", color: "0xFFFFFF", interval: "5000", size: "15", text: "W", type: "rtext" },
    ]);
    expect(init.body).not.toContain("sec");
  });

  it("refuses anything that is not a VdoCipher id, so no path can be injected", () => {
    expect(() => buildOtpRequest({ apiSecret: "s", vdocipherId: "../x", watermark: "W" })).toThrow();
  });
});

describe("parseVideoStatus", () => {
  it("maps VdoCipher's spelling to ours", () => {
    expect(parseVideoStatus("ready")).toBe("ready");
    expect(parseVideoStatus("Pre-Upload")).toBe("pre_upload");
    expect(parseVideoStatus("Queued")).toBe("processing");
  });
});

describe("createUploadCredentials", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("asks VdoCipher with a PUT and hands back only the string payload fields", async () => {
    const { createUploadCredentials } = await import("./vdocipher");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ clientPayload: { key: "k", policy: "p", uploadLink: "https://s3.example/x" }, videoId: id }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VDOCIPHER_API_SECRET", "test-secret");

    const result = await createUploadCredentials("Number systems 1");
    expect(result).toEqual({
      clientPayload: { key: "k", policy: "p", uploadLink: "https://s3.example/x" },
      videoId: id,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://dev.vdocipher.com/api/videos?title=Number%20systems%201");
    expect(init.method).toBe("PUT");
  });

  it("refuses a response with no upload link", async () => {
    const { createUploadCredentials } = await import("./vdocipher");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ clientPayload: {}, videoId: id }), { status: 200 })),
    );
    vi.stubEnv("VDOCIPHER_API_SECRET", "test-secret");
    await expect(createUploadCredentials("T")).rejects.toThrow();
  });
});
