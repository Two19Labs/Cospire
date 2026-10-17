import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { deleteVideo } from "@/features/video/vdocipher";

import { collapseName, describeDeletion, parseDeleteTargetType } from "./targets";

// The confirmation sentence is the only thing between a click and rows that
// cannot come back, so it is pinned here.
describe("describeDeletion", () => {
  it("states the thing and every non-zero count, in words", () => {
    expect(describeDeletion("mock", { attempts: 14, responses: 28, grants: 1, proctorEvents: 0 })).toEqual([
      "this mock test",
      "14 student attempts and their results",
      "28 saved answers",
      "1 student access grant",
    ]);
  });

  it("uses the singular for one and leaves zeros out", () => {
    expect(describeDeletion("document", { grants: 1, curriculumItems: 0, storageObjects: 1 })).toEqual([
      "this document",
      "1 student access grant",
      "1 stored file",
    ]);
  });

  it("says what a programme is, with nothing hanging off it", () => {
    expect(describeDeletion("programme", {})).toEqual(["this programme"]);
  });
});

describe("collapseName", () => {
  // `public.delete_content` normalises the typed name with
  // `regexp_replace(btrim(name), '\s+', ' ', 'g')` and nothing else. These two
  // have to agree, or a name the form accepts is refused by the database with
  // no way for the admin to tell why.
  it("trims and collapses whitespace, and changes nothing else", () => {
    expect(collapseName("  Mock   One  ")).toBe("Mock One");
    expect(collapseName("mock one")).toBe("mock one");
    expect(collapseName("Mock\tOne\nTwo")).toBe("Mock One Two");
  });

  it("is not forgiving about case: the typing is the last deliberate step", () => {
    expect(collapseName("mock one")).not.toBe(collapseName("Mock One"));
  });

  it("reads anything that is not a string as no name at all", () => {
    expect(collapseName(null)).toBe("");
    expect(collapseName(undefined)).toBe("");
  });
});

describe("parseDeleteTargetType", () => {
  it("admits exactly the four deletable kinds", () => {
    expect(parseDeleteTargetType("mock")).toBe("mock");
    expect(parseDeleteTargetType("programme")).toBe("programme");
    expect(parseDeleteTargetType("document")).toBe("document");
    expect(parseDeleteTargetType("video")).toBe("video");
  });

  it("refuses anything else, including a question", () => {
    expect(parseDeleteTargetType("question")).toBeNull();
    expect(parseDeleteTargetType("__proto__")).toBeNull();
    expect(parseDeleteTargetType(7)).toBeNull();
  });
});

// Nobody can watch this call happen, so it is pinned here: the id goes in the
// query string (`DELETE /videos?videos=<id>`), which is the one VdoCipher
// documents and the one `video-upload-live.mjs` has really deleted a video
// with. A path segment answers 200 and deletes nothing.
describe("deleteVideo", () => {
  const id = "a".repeat(32);

  it("asks VdoCipher to delete that id, with the secret in the header", async () => {
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const original = globalThis.fetch;
    process.env.VDOCIPHER_API_SECRET = "sec";
    globalThis.fetch = ((url: string, init: RequestInit) => {
      calls.push({ init, url });
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch;
    try {
      await deleteVideo(id);
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://dev.vdocipher.com/api/videos?videos=${id}`);
    expect(calls[0].init.method).toBe("DELETE");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Apisecret sec");
  });

  it("refuses anything that is not a VdoCipher id before calling out", async () => {
    await expect(deleteVideo("not-an-id")).rejects.toThrow("Not a VdoCipher video id.");
  });
});
