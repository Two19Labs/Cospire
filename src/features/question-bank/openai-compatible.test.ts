import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readQuestionsWithOpenAiCompatible } from "./openai-compatible";

// The second provider, against a stubbed `fetch`. Nothing here talks to a real
// service.
//
// What matters is that it is interchangeable with the Gemini path: the same
// instruction, the same figure order, the same retry policy, the same shape of
// answer and the same kind of failure message. If the two drift, a paper
// imported through one will not match the same paper imported through the other,
// and the difference will be blamed on the model rather than on us.

const BASE = "https://api.example.test/v1";
const KEY = "test-key";

const ok = (content: string, usage: Record<string, unknown> = {}) => ({
  json: async () => ({
    choices: [{ finish_reason: "stop", message: { content } }],
    usage: { completion_tokens: 20, prompt_tokens: 100, ...usage },
  }),
  ok: true,
  status: 200,
});

const fail = (status: number, message = "nope") => ({
  json: async () => ({ error: { message } }),
  ok: false,
  status,
});

const answer = JSON.stringify({ questions: [{ answer: "4", question: "2+2?", type: "tita" }] });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function withTimers<T>(run: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  const pending = run();
  await vi.advanceTimersByTimeAsync(60_000);
  return pending;
}

const call = (over: Record<string, unknown> = {}) =>
  readQuestionsWithOpenAiCompatible({ apiKey: KEY, baseUrl: BASE, figures: [], text: "Q1.", ...over });

describe("readQuestionsWithOpenAiCompatible", () => {
  it("posts to the provider's chat-completions endpoint and asks for JSON", async () => {
    fetchMock.mockResolvedValue(ok(answer));
    await call();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.temperature).toBe(0);
  });

  it("tolerates a trailing slash on the configured address", async () => {
    fetchMock.mockResolvedValue(ok(answer));
    await call({ baseUrl: "https://api.example.test/v1///" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.test/v1/chat/completions");
  });

  it("sends the key as a bearer token and never in the URL", async () => {
    fetchMock.mockResolvedValue(ok(answer));
    await call();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain(KEY);
    expect(init.headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it("sends the instruction, then the pictures in figure order, then the text", async () => {
    fetchMock.mockResolvedValue(ok(answer));
    await call({
      figures: [
        { base64: "AAA", mimeType: "image/png", n: 1 },
        { base64: "BBB", mimeType: "image/jpeg", n: 2 },
      ],
      text: "Q1. [[figure:1]] and [[figure:2]]",
    });

    const parts = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(parts[0].text).toContain("[[figure:1]]");
    expect(parts[1].image_url.url).toBe("data:image/png;base64,AAA");
    expect(parts[2].image_url.url).toBe("data:image/jpeg;base64,BBB");
    expect(parts[3].text).toBe("Q1. [[figure:1]] and [[figure:2]]");
  });

  it("asks for the same thing the Gemini path asks for", async () => {
    // One instruction, two providers. A paper must not read differently
    // depending on which service happened to answer.
    const { buildModelInstruction } = await import("./model-call");
    fetchMock.mockResolvedValue(ok(answer));
    await call();

    const parts = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(parts[0].text).toBe(buildModelInstruction());
  });

  it("returns the answer and what it cost", async () => {
    fetchMock.mockResolvedValue(ok(answer));
    const result = await call();

    expect(result.json).toBe(answer);
    expect(result.problems).toEqual([]);
    expect(result.usage).toEqual({ answer: 20, prompt: 100, thinking: 0 });
  });

  it("reads reasoning tokens where a provider reports them", async () => {
    fetchMock.mockResolvedValue(ok(answer, { completion_tokens_details: { reasoning_tokens: 77 } }));
    expect((await call()).usage?.thinking).toBe(77);
  });

  it("retries a 503 and succeeds when the provider comes back", async () => {
    fetchMock.mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok(answer));
    const result = await withTimers(() => call());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.json).toBe(answer);
  });

  it("gives up after four tries, naming the provider the admin configured", async () => {
    fetchMock.mockResolvedValue(fail(429));
    const result = await withTimers(() => call({ label: "Groq" }));

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.problems[0]).toMatch(/^Groq is busy or over its rate limit/);
  });

  it("does not retry a refusal", async () => {
    fetchMock.mockResolvedValue(fail(400, "bad request"));
    const result = await call();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.problems[0]).toMatch(/refused the request: bad request/);
  });

  it("says the model is gone when the provider does not have it", async () => {
    fetchMock.mockResolvedValue(fail(404, "model not found"));
    const result = await call();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.problems[0]).toMatch(/does not have that model.*retired/s);
  });

  it("says to split the paper when the answer was cut off", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ choices: [{ finish_reason: "length", message: { content: '{"questions":[' } }], usage: {} }),
      ok: true,
      status: 200,
    });
    const result = await call();

    expect(result.json).toBeNull();
    expect(result.problems[0]).toMatch(/ran out of room.*Split the document/s);
  });

  it("survives a network error rather than throwing", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    const result = await withTimers(() => call());

    expect(result.json).toBeNull();
    expect(result.problems[0]).toMatch(/could not be reached/);
  });

  it("refuses without a key, without an address, and without text", async () => {
    expect((await call({ apiKey: undefined })).problems[0]).toMatch(/No model key is configured/);
    expect((await call({ baseUrl: "" })).problems[0]).toMatch(/No address is configured/);
    expect((await call({ text: "   " })).problems[0]).toMatch(/no text to send/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads no secret out of the environment, so there is none in it to leak", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./openai-compatible.ts", import.meta.url), "utf8"),
    );
    const code = source
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("process.env");
  });
});
