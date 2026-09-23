// Asking Gemini to read a question paper.
//
// **The key is passed in, never read here.** `GEMINI_API_KEY` is read by the
// Server Action that calls this, which is a `"use server"` file and so can never
// reach a client bundle. Keeping `process.env` out of this module means there is
// no secret in it to leak even if it were imported somewhere careless -- a
// structural guarantee rather than a rule someone has to remember, and it leaves
// the module pure enough to test without a running server.
//
// Plain `fetch`, no SDK: `@google/genai` was declined by the owner on
// 2026-09-23 and there is nothing here an SDK would do for us.
//
// Three things this file exists to get right, each of which costs money or
// accuracy if got wrong:
//
//  - **Thinking is turned off.** Gemini thinks by default and thinking tokens
//    bill as output. The probe recorded in `docs/context/verification-log.md`
//    spent 189 thinking tokens to answer in 14. `thinkingBudget: 0` is not a
//    tuning knob here, it is the difference between Rs 5 and Rs 20 a paper.
//  - **The answer shape is forced by `responseSchema`**, so the reply is always
//    JSON and never prose wrapped round it. It is still handed to
//    `parseImportedQuestions` afterwards, because a schema constrains the shape
//    and says nothing about whether the answer key is right.
//  - **503 is the normal failure, not the rare one.** Every model on this
//    account answered 503 UNAVAILABLE for several minutes on 2026-09-23. So a
//    single attempt is not an implementation, and a failure has to come back as
//    a sentence an admin can act on rather than an exception.

import { buildQuestionImportPrompt } from "./import-prompt";
import { maxQuestionsPerImport } from "./import-spec";

// Verified working on this key on 2026-09-23. Overridable so a model that is
// overloaded, retired or too dear can be changed without a deploy.
export const defaultGeminiModel = "gemini-3.8-flash";
const endpoint = "https://generativelanguage.googleapis.com/v1beta/models";

// A paper this long is not one document. Bounded before it is billed.
export const geminiMaxCharacters = 200_000;
// Each picture sent costs tokens. A paper quoting more than this many figures
// is past the point where sending them all is worth it.
export const geminiMaxFigures = 40;

const maxAttempts = 4;
const requestTimeoutMs = 120_000;

export interface GeminiFigure {
  base64: string;
  mimeType: string;
  n: number;
}

export interface GeminiUsage {
  answer: number;
  prompt: number;
  thinking: number;
}

export interface GeminiOutcome {
  // The model's raw answer, for `parseImportedQuestions` to read. Null on
  // failure, and `problems` then says why in a sentence.
  json: string | null;
  problems: string[];
  usage: GeminiUsage | null;
}

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

// The shared prompt, plus only what is true of this call and not of a paste.
export function buildGeminiInstruction(): string {
  return `${buildQuestionImportPrompt()}

Two rules for this call in particular, which override anything above that disagrees:

A. Write "answer" as a plain string, never as a list. For more than one correct
   option write them separated by commas, as "A, C". For a typed answer with
   more than one acceptable form write them joined by "or", as "0.5 or 1/2".
B. The pictures from the document are attached to this message in order. Picture
   1 is [[figure:1]], picture 2 is [[figure:2]], and so on. Use them to read
   anything the text does not say, but keep every marker exactly where it is in
   the text given to you, and do not write a marker for a picture that has none.

The document's text follows.`;
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

function describeFailure(status: number, message: string): string {
  if (status === 503 || status === 429) {
    return "Gemini is busy or over its rate limit and did not answer after several tries. Wait a minute and send it again, or use the copy-and-paste path below.";
  }
  if (status === 401 || status === 403) {
    return "Gemini refused the key. Check that GEMINI_API_KEY is set on the server and that billing is enabled on the Google account.";
  }
  if (status === 400) {
    return `Gemini refused the request: ${message.slice(0, 300)}`;
  }
  return `Gemini answered ${status}. Try again, or use the copy-and-paste path below.`;
}

const retryable = new Set([408, 429, 500, 502, 503, 504]);

export async function readQuestionsWithGemini({
  apiKey,
  figures,
  model = defaultGeminiModel,
  text,
}: {
  apiKey: string | undefined;
  figures: GeminiFigure[];
  model?: string;
  text: string;
}): Promise<GeminiOutcome> {
  const key = apiKey;
  if (!key) {
    return { json: null, problems: ["No Gemini key is configured on the server, so this path is unavailable."], usage: null };
  }
  if (text.trim() === "") {
    return { json: null, problems: ["There is no text to send."], usage: null };
  }
  if (text.length > geminiMaxCharacters) {
    return {
      json: null,
      problems: [`That document is ${text.length.toLocaleString()} characters, and one call takes at most ${geminiMaxCharacters.toLocaleString()}. Split it and import it in parts.`],
      usage: null,
    };
  }

  const sent = figures.slice(0, geminiMaxFigures);

  const body = {
    contents: [
      {
        parts: [
          { text: buildGeminiInstruction() },
          ...sent.map((figure) => ({ inline_data: { data: figure.base64, mime_type: figure.mimeType } })),
          { text },
        ],
        role: "user",
      },
    ],
    generationConfig: {
      // Thinking off. See the note at the top of this file.
      thinkingConfig: { thinkingBudget: 0 },
      // A question paper has one right reading; there is nothing to be creative
      // about, and a re-run should give the same answer.
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  let lastStatus = 0;
  let lastMessage = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(`${endpoint}/${model}:generateContent`, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        method: "POST",
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);

      if (response.ok) {
        const candidate = payload?.candidates?.[0];
        const answer = candidate?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
        const usageRaw = payload?.usageMetadata ?? {};
        const usage: GeminiUsage = {
          answer: Number(usageRaw.candidatesTokenCount ?? 0),
          prompt: Number(usageRaw.promptTokenCount ?? 0),
          thinking: Number(usageRaw.thoughtsTokenCount ?? 0),
        };

        if (candidate?.finishReason === "MAX_TOKENS") {
          return {
            json: null,
            problems: [`Gemini ran out of room part way through. Split the document and import it in parts, or reduce it below ${maxQuestionsPerImport} questions.`],
            usage,
          };
        }
        if (answer.trim() === "") {
          return { json: null, problems: ["Gemini answered with nothing. Try again, or use the copy-and-paste path below."], usage };
        }
        return { json: answer, problems: [], usage };
      }

      lastStatus = response.status;
      lastMessage = String(payload?.error?.message ?? "");
      if (!retryable.has(response.status)) break;
    } catch (cause) {
      lastStatus = 0;
      lastMessage = cause instanceof Error ? cause.message : String(cause);
    } finally {
      clearTimeout(timer);
    }

    if (attempt < maxAttempts) {
      // 1s, 2s, 4s. Long enough to ride out the overload seen on 2026-09-23,
      // short enough that an admin is not left watching a spinner.
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }

  return {
    json: null,
    problems: [lastStatus === 0 ? "Gemini could not be reached. Check the server's network, or use the copy-and-paste path below." : describeFailure(lastStatus, lastMessage)],
    usage: null,
  };
}
