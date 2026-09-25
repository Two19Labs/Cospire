// What every model path shares: the instruction, the limits, the answer shape,
// and what a failure looks like.
//
// There are two providers because there have to be. **Gemini is the production
// path**, on the Client's own Google account, and the Client has agreed its
// cost. But that project's billing was not enabled, and an unbilled Google
// project is served on leftover capacity at five requests a minute -- which is
// not a thing a question paper can be imported through, and which made the path
// impossible to verify for three days.
//
// **A free tier must never see a real Cospire question paper.** Free usage is
// free because the provider may train on what it is given, and clause 13.1 makes
// the Client's content confidential. So the second provider exists to exercise
// the code against synthetic fixtures, and for nothing else. That is a rule
// about what is *sent*, which no amount of configuration can enforce, so it is
// written here where anyone adding a provider will read it.
//
// The key is never read in these modules. The `"use server"` action supplies it,
// so there is no secret here to leak and these stay testable without a server.

import { buildQuestionImportPrompt } from "./import-prompt";
import { maxQuestionsPerImport } from "./import-spec";

// A paper this long is not one document. Bounded before it is billed.
export const modelMaxCharacters = 200_000;
// Each picture sent costs tokens. A paper quoting more than this many figures is
// past the point where sending them all is worth it.
export const modelMaxFigures = 40;

export const modelMaxAttempts = 4;
export const modelRequestTimeoutMs = 120_000;

// 408 and the 5xx family are worth another try. A 400 is not: the answer would
// be the same and the second call costs the same as the first.
export const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);

export interface ModelFigure {
  base64: string;
  mimeType: string;
  n: number;
}

export interface ModelUsage {
  answer: number;
  prompt: number;
  thinking: number;
}

export interface ModelOutcome {
  // The model's raw answer, for `parseImportedQuestions` to read. Null on
  // failure, and `problems` then says why in a sentence.
  json: string | null;
  problems: string[];
  usage: ModelUsage | null;
}

export interface ModelRequest {
  apiKey: string | undefined;
  figures: ModelFigure[];
  model?: string;
  text: string;
}

// The shared prompt, plus only what is true of an API call and not of a paste.
//
// One instruction for both providers, so a change to what is asked for cannot
// drift between them.
export function buildModelInstruction(): string {
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
// Shared refusals
// ---------------------------------------------------------------------------

// Checked before anything is sent, so a request that cannot succeed is never
// billed for.
export function refuseBeforeSending({ apiKey, text }: { apiKey: string | undefined; text: string }): ModelOutcome | null {
  if (!apiKey) {
    return { json: null, problems: ["No model key is configured on the server, so this path is unavailable."], usage: null };
  }
  if (text.trim() === "") {
    return { json: null, problems: ["There is no text to send."], usage: null };
  }
  if (text.length > modelMaxCharacters) {
    return {
      json: null,
      problems: [
        `That document is ${text.length.toLocaleString()} characters, and one call takes at most ${modelMaxCharacters.toLocaleString()}. Split it and import it in parts.`,
      ],
      usage: null,
    };
  }
  return null;
}

export function describeModelFailure(provider: string, status: number, message: string): string {
  if (status === 0) {
    return `${provider} could not be reached. Check the server's network, or use the copy-and-paste path below.`;
  }
  if (status === 503 || status === 429) {
    return `${provider} is busy or over its rate limit and did not answer after several tries. Wait a minute and send it again, or use the copy-and-paste path below.`;
  }
  if (status === 401 || status === 403) {
    return `${provider} refused the key. Check that it is set on the server and that the account behind it has billing enabled.`;
  }
  if (status === 404) {
    return `${provider} does not have that model. It may have been retired; set the model name to one the provider still serves.`;
  }
  if (status === 400) {
    return `${provider} refused the request: ${message.slice(0, 300)}`;
  }
  return `${provider} answered ${status}. Try again, or use the copy-and-paste path below.`;
}

export function truncatedAnswer(provider: string): string {
  return `${provider} ran out of room part way through. Split the document and import it in parts, or reduce it below ${maxQuestionsPerImport} questions.`;
}

export function emptyAnswer(provider: string): string {
  return `${provider} answered with nothing. Try again, or use the copy-and-paste path below.`;
}

// 1s, 2s, 4s. Long enough to ride out a brief overload, short enough that an
// admin is not left watching a spinner. Deliberately NOT long enough to wait out
// a free tier's five-a-minute quota: that is a configuration fault to be fixed,
// not a delay to be absorbed into every admin's afternoon.
export function backoffMs(attempt: number): number {
  return 1000 * 2 ** (attempt - 1);
}
