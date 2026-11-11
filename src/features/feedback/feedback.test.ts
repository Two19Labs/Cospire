import { describe, expect, it } from "vitest";

import { modeFor, parseStatus, parseThought } from "./feedback";

const client = "c".repeat(32);
const owner = "o".repeat(32);

describe("modeFor", () => {
  it("tells the two links apart and refuses anything else", () => {
    expect(modeFor(client, { client, owner })).toBe("client");
    expect(modeFor(owner, { client, owner })).toBe("owner");
    expect(modeFor("c".repeat(31), { client, owner })).toBeNull();
    expect(modeFor("nope", { client, owner })).toBeNull();
  });

  it("never opens on a missing or short code", () => {
    expect(modeFor("", { client: "", owner: undefined })).toBeNull();
    expect(modeFor("short", { client: "short", owner })).toBeNull();
  });
});

describe("parseThought", () => {
  const path = "thoughts/123e4567-e89b-12d3-a456-426614174000.png";

  it("accepts a thought and trims it", () => {
    expect(parseThought({ authorName: " Rahul ", body: " It is slow ", screenshots: [path], title: " Import ", urgent: true })).toEqual({
      authorName: "Rahul", body: "It is slow", screenshots: [path], title: "Import", urgent: true,
    });
    expect(parseThought({ body: "b", title: "t" })).toMatchObject({ authorName: null, screenshots: [], urgent: false });
  });

  it("refuses an empty title, an over-long body and a path it did not issue", () => {
    expect(typeof parseThought({ body: "b", title: "  " })).toBe("string");
    expect(typeof parseThought({ body: "x".repeat(5001), title: "t" })).toBe("string");
    expect(typeof parseThought({ body: "b", screenshots: ["../documents/secret.pdf"], title: "t" })).toBe("string");
    expect(typeof parseThought({ body: "b", screenshots: Array(6).fill(path), title: "t" })).toBe("string");
  });
});

describe("parseStatus", () => {
  it("knows the five statuses only", () => {
    expect(parseStatus("out_of_scope")).toBe("out_of_scope");
    expect(parseStatus("deleted")).toBeNull();
  });
});
