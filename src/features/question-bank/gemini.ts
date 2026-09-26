// Asking Gemini to read a question paper. **This is the production path.**
//
// The key is passed in, never read here. `GEMINI_API_KEY` is read by the
// Server Action that calls this, which is a `"use server"` file and so can never
// reach a client bundle. Keeping `process.env` out of this module means there is
// no secret in it to leak even if it were imported somewhere careless -- a
// structural guarantee rather than a rule someone has to remember, and it leaves
// the module pure enough to test without a running server.
//
// Plain `fetch`, no SDK: `@google/genai` was declined by the owner on
// 2026-09-23 and there is nothing here an SDK would do for us.
//
// The limits, the instruction, the retry policy and the failure wording are
// shared with the other provider in `model-call.ts`, so the two cannot drift.
// What is Gemini's own and stays here:
//
//  - **Thinking is turned off.** Gemini thinks by default and thinking tokens
//    bill as output. The probe recorded in `docs/context/verification-log.md`
//    spent 189 thinking tokens to answer in 14. `thinkingBudget: 0` is not a
//    tuning knob, it is the difference between Rs 5 and Rs 20 a paper.
//  - **The answer shape is forced by `responseSchema`**, which Gemini supports
//    natively and the other provider does not. It is still handed to
//    `parseImportedQuestions` afterwards, because a schema constrains shape and
//    says nothing about whether an answer key is right.
//  - **The key wording for a refusal names billing**, because an unbilled Google
//    project is exactly what went wrong here: it is served on leftover capacity
//    at five requests a minute and answers 503 "high demand" the rest of the
//    time, which reads like an outage and is not one.

import {
  backoffMs,
  buildModelInstruction,
  describeModelFailure,
  emptyAnswer,
  modelMaxAttempts,
  modelMaxCharacters,
  modelMaxFigures,
  modelRequestTimeoutMs,
  refuseBeforeSending,
  retryableStatuses,
  truncatedAnswer,
  type ModelFigure,
  type ModelOutcome,
  type ModelRequest,
  type ModelUsage,
} from "./model-call";

// Verified working on this key on 2026-09-23. Overridable so a model that is
// overloaded, retired or too dear can be changed without a deploy.
export const defaultGeminiModel = "gemini-3.8-flash";
const endpoint = "https://generativelanguage.googleapis.com/v1beta/models";
const provider = "Gemini";

// Re-exported under the old names, because callers and tests already use them.
export const geminiMaxCharacters = modelMaxCharacters;
export const geminiMaxFigures = modelMaxFigures;
export type GeminiFigure = ModelFigure;
export type GeminiUsage = ModelUsage;
export type GeminiOutcome = ModelOutcome;

// One instruction for both providers, so what is asked for cannot drift between
// them. Kept under this name because the prompt-drift test uses it.
export const buildGeminiInstruction = buildModelInstruction;

// ---------------------------------------------------------------------------
// The answer shape
// ---------------------------------------------------------------------------

// Deliberately flat: `answer` is always a string, never sometimes a list.
//
// Gemini's schema has no union type, so a field that is "a letter, or a list of
// letters" cannot be declared. Rather than force the model into one shape and
// lose the other, the answer stays a string and the model is told to write
// "A, C" for two correct options and "0.5 or 1/2" for two accepted typed
// answers. `parseImportedQuestions` already reads both of those spellings --
// `answerParts` splits on commas and "and", and typed answers split on "or" --
// so nothing new has to understand them.
const questionProperties = {
  answer: { type: "STRING" },
  difficulty: { type: "STRING", enum: ["easy", "medium", "hard"] },
  marks: { type: "NUMBER" },
  options: { items: { type: "STRING" }, type: "ARRAY" },
  question: { type: "STRING" },
  section: { type: "STRING" },
  solution: { type: "STRING" },
  source: { type: "STRING" },
  topic: { type: "STRING" },
  type: { type: "STRING", enum: ["mcq", "mcq_multi", "tita", "di_set"] },
};

const responseSchema = {
  properties: {
    document: { type: "STRING" },
    questions: {
      items: {
        properties: {
          ...questionProperties,
          passage: { type: "STRING" },
          // A DI set's own questions. One level only: a set inside a set is
          // refused by the parser anyway.
          questions: {
            items: { properties: questionProperties, required: ["type", "question"], type: "OBJECT" },
            type: "ARRAY",
          },
        },
        required: ["type"],
        type: "OBJECT",
      },
      type: "ARRAY",
    },
  },
  required: ["questions"],
  type: "OBJECT",
};

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

function describeFailure(status: number, message: string): string {
  if (status === 401 || status === 403) {
    return "Gemini refused the key. Check that GEMINI_API_KEY is set on the server and that billing is enabled on the Google Cloud project behind it.";
  }
  return describeModelFailure(provider, status, message);
}

export async function readQuestionsWithGemini({
  apiKey,
  figures,
  model = defaultGeminiModel,
  text,
}: ModelRequest): Promise<ModelOutcome> {
  const refusal = refuseBeforeSending({ apiKey, text });
  if (refusal) return refusal;

  const sent = figures.slice(0, modelMaxFigures);

  const body = {
    contents: [
      {
        parts: [
          { text: buildModelInstruction() },
          ...sent.map((figure) => ({ inline_data: { data: figure.base64, mime_type: figure.mimeType } })),
          { text },
        ],
        role: "user",
      },
    ],
    generationConfig: {
      thinkingConfig: { thinkingBudget: 0 },
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  let lastStatus = 0;
  let lastMessage = "";

  for (let attempt = 1; attempt <= modelMaxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), modelRequestTimeoutMs);
    try {
      const response = await fetch(`${endpoint}/${model}:generateContent`, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey ?? "" },
        method: "POST",
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);

      if (response.ok) {
        const candidate = payload?.candidates?.[0];
        const answer = candidate?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
        const usageRaw = payload?.usageMetadata ?? {};
        const usage: ModelUsage = {
          answer: Number(usageRaw.candidatesTokenCount ?? 0),
          prompt: Number(usageRaw.promptTokenCount ?? 0),
          thinking: Number(usageRaw.thoughtsTokenCount ?? 0),
        };

        if (candidate?.finishReason === "MAX_TOKENS") {
          return { json: null, problems: [truncatedAnswer(provider)], usage };
        }
        if (answer.trim() === "") {
          return { json: null, problems: [emptyAnswer(provider)], usage };
        }
        return { json: answer, problems: [], usage };
      }

      lastStatus = response.status;
      lastMessage = String(payload?.error?.message ?? "");
      if (!retryableStatuses.has(response.status)) break;
    } catch (cause) {
      lastStatus = 0;
      lastMessage = cause instanceof Error ? cause.message : String(cause);
    } finally {
      clearTimeout(timer);
    }

    if (attempt < modelMaxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
    }
  }

  return { json: null, problems: [describeFailure(lastStatus, lastMessage)], usage: null };
}
