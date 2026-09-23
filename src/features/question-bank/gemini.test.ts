import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildGeminiInstruction, geminiMaxCharacters, readQuestionsWithGemini } from "./gemini";

// The Gemini call, against a stubbed `fetch`.
//
// Nothing here talks to Google. What is worth testing is everything around the
// call: that thinking is off (it bills as output), that a 503 is retried (every
// model on this account answered 503 for minutes on 2026-09-23), that a 400 is
// not retried, and that a failure comes back as a sentence rather than an
// exception.

const ok = (text: string, usage: Record<string, number> = {}) => ({
  json: async () => ({
    candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
    usageMetadata: { candidatesTokenCount: 20, promptTokenCount: 100, ...usage },
  }),
  ok: true,
  status: 200,
});

const fail = (status: number, message = "nope") => ({
  json: async () => ({ error: { message, status: "ERROR" } }),
  ok: false,
  status,
});

const answer = JSON.stringify({ questions: [{ answer: "4", question: "2+2?", type: "tita" }] });

const KEY = "test-key";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// The backoff sleeps between attempts, so anything that exercises a retry runs
// on fake timers rather than making the suite wait seven seconds.
async function withTimers<T>(run: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  const pending = run();
  await vi.advanceTimersByTimeAsync(60_000);
  return pending;
}

describe("readQuestionsWithGemini", () => {
  it("turns thinking off and asks for JSON, because thinking bills as output", async () => {
    fetchMock.mockResolvedValue(ok(answer));
    await readQuestionsWithGemini({ apiKey: KEY, figures: [], text: "Q1. 2+2?" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.required).toEqual(["questions"]);
  });

  it("sends the key in the header and never in the URL, where it would be logged", async () => {
    fetchMock.mockResolvedValue(ok(answer));
    await readQuestionsWithGemini({ apiKey: KEY, figures: [], text: "Q1." });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain(KEY);
    expect(init.headers["x-goog-api-key"]).toBe(KEY);
  });

  it("sends the instruction, then the pictures in figure order, then the text", async () => {
    fetchMock.mockResolvedValue(ok(answer));
    await readQuestionsWithGemini({
      apiKey: KEY,
      figures: [
        { base64: "AAA", mimeType: "image/png", n: 1 },
        { base64: "BBB", mimeType: "image/jpeg", n: 2 },
      ],
      text: "Q1. [[figure:1]] and [[figure:2]]",
    });

    const parts = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts;
    expect(parts[0].text).toContain("[[figure:1]]");
    expect(parts[1].inline_data).toEqual({ data: "AAA", mime_type: "image/png" });
    expect(parts[2].inline_data).toEqual({ data: "BBB", mime_type: "image/jpeg" });
    expect(parts[3].text).toBe("Q1. [[figure:1]] and [[figure:2]]");
  });

  it("returns the answer and what it cost", async () => {
    fetchMock.mockResolvedValue(ok(answer, { thoughtsTokenCount: 0 }));
    const result = await readQuestionsWithGemini({ apiKey: KEY, figures: [], text: "Q1." });

    expect(result.json).toBe(answer);
    expect(result.problems).toEqual([]);
    expect(result.usage).toEqual({ answer: 20, prompt: 100, thinking: 0 });
  });

  it("retries a 503 and succeeds when the model comes back", async () => {
    fetchMock.mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok(answer));
    const result = await withTimers(() => readQuestionsWithGemini({ apiKey: KEY, figures: [], text: "Q1." }));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.json).toBe(answer);
  });

  it("gives up after four tries and says so in a sentence an admin can act on", async () => {
    fetchMock.mockResolvedValue(fail(503));
    const result = await withTimers(() => readQuestionsWithGemini({ apiKey: KEY, figures: [], text: "Q1." }));

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.json).toBeNull();
    expect(result.problems[0]).toMatch(/busy or over its rate limit.*copy-and-paste path/s);
  });

  it("does not retry a refusal, because trying again spends money on the same answer", async () => {
    fetchMock.mockResolvedValue(fail(400, "Invalid JSON payload"));
    const result = await readQuestionsWithGemini({ apiKey: KEY, figures: [], text: "Q1." });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.problems[0]).toMatch(/Gemini refused the request: Invalid JSON payload/);
  });

  it("names the key and billing when Gemini refuses the credentials", async () => {
    fetchMock.mockResolvedValue(fail(403, "permission denied"));
    const result = await readQuestionsWithGemini({ apiKey: KEY, figures: [], text: "Q1." });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.problems[0]).toMatch(/GEMINI_API_KEY.*billing is enabled/);
  });

  it("says to split the paper when the answer was cut off", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"questions":[' }] }, finishReason: "MAX_TOKENS" }],
        usageMetadata: {},
      }),
      ok: true,
      status: 200,
    });
    const result = await readQuestionsWithGemini({ apiKey: KEY, figures: [], text: "Q1." });

    expect(result.json).toBeNull();
    expect(result.problems[0]).toMatch(/ran out of room.*Split the document/s);
  });

  it("survives a network error and reports it rather than throwing", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    const result = await withTimers(() => readQuestionsWithGemini({ apiKey: KEY, figures: [], text: "Q1." }));

    expect(result.json).toBeNull();
    expect(result.problems[0]).toMatch(/could not be reached/);
  });

  it("refuses to bill for a document longer than one call takes", async () => {
    const result = await readQuestionsWithGemini({ apiKey: KEY, figures: [], text: "x".repeat(geminiMaxCharacters + 1) });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.problems[0]).toMatch(/Split it and import it in parts/);
  });

  it("refuses an empty document without calling out", async () => {
    const result = await readQuestionsWithGemini({ apiKey: KEY, figures: [], text: "   " });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.problems[0]).toMatch(/no text to send/);
  });

  it("says the path is unavailable when the server holds no key", async () => {
    const result = await readQuestionsWithGemini({ apiKey: undefined, figures: [], text: "Q1." });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.problems[0]).toMatch(/No Gemini key is configured/);
  });

  it("honours a model override, so an overloaded model can be changed without a deploy", async () => {
    fetchMock.mockResolvedValue(ok(answer));
    await readQuestionsWithGemini({ apiKey: KEY, figures: [], model: "gemini-3.5-flash", text: "Q1." });

    expect(fetchMock.mock.calls[0][0]).toContain("/gemini-3.5-flash:generateContent");
  });

  it("reads no secret out of the environment, so there is none in it to leak", async () => {
    // The key arrives as an argument. This is what lets the module be imported
    // and tested without a server, and what makes a careless import harmless.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./gemini.ts", import.meta.url), "utf8"),
    );
    // Comments are stripped first: the header explains the rule, and a test that
    // convicted the explanation of breaking it would be a nuisance rather than a
    // guard.
    const code = source
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("process.env");
  });
});

describe("buildGeminiInstruction", () => {
  it("carries the shared prompt, so the two paths cannot ask for different things", () => {
    const instruction = buildGeminiInstruction();
    expect(instruction).toContain("di_set");
    expect(instruction).toContain("[[figure:1]]");
  });

  it("overrides the answer shape, because Gemini's schema has no union type", () => {
    const instruction = buildGeminiInstruction();
    expect(instruction).toMatch(/never as a list/);
    expect(instruction).toContain('"A, C"');
    expect(instruction).toContain('"0.5 or 1/2"');
  });
});
