// The second model path: anything speaking the OpenAI chat-completions shape.
//
// **This exists for testing, and the reason is in `model-call.ts`: a free tier
// must never see a real Cospire question paper.** Groq, OpenRouter, Mistral,
// Together and the rest are free because they may train on what they are given,
// and clause 13.1 makes the Client's content confidential. Synthetic fixtures
// only. Real papers go through the paid Gemini path.
//
// Chosen over a second native integration because the shape is a de facto
// standard: one implementation reaches every provider worth testing against, and
// swapping provider is then an environment variable rather than a deployment.
//
// Plain `fetch`, no SDK, for the same reason the Gemini path uses none.
//
// Two differences from the Gemini path, both deliberate:
//
//  - **`json_object`, not a JSON schema.** Providers disagree about schema
//    support and disagree again about which dialect. `json_object` is the one
//    thing they all honour, and the answer is handed to
//    `parseImportedQuestions` regardless -- which is lenient about names and
//    strict about values, and was written for pasted output from an unknown
//    model in the first place.
//  - **Reasoning text is tolerated rather than suppressed.** There is no
//    portable way to turn thinking off across providers. It does not matter
//    here: `extractJsonBlock` finds the object inside whatever prose surrounds
//    it, which is the same path a pasted answer takes.

import {
  backoffMs,
  buildModelInstruction,
  describeModelFailure,
  emptyAnswer,
  modelMaxAttempts,
  modelMaxFigures,
  modelRequestTimeoutMs,
  refuseBeforeSending,
  retryableStatuses,
  truncatedAnswer,
  type ModelOutcome,
  type ModelRequest,
} from "./model-call";

export const defaultOpenAiCompatibleModel = "llama-3.3-70b-versatile";

export interface OpenAiCompatibleRequest extends ModelRequest {
  // The provider's API root, without a trailing slash: `/chat/completions` is
  // appended. For example `https://api.groq.com/openai/v1`.
  baseUrl: string;
  // Named in every message the admin sees, so nobody has to guess which service
  // answered.
  label?: string;
  maxTokens?: number;
}

export async function readQuestionsWithOpenAiCompatible({
  apiKey,
  baseUrl,
  figures,
  label,
  maxTokens = 32_000,
  model = defaultOpenAiCompatibleModel,
  text,
}: OpenAiCompatibleRequest): Promise<ModelOutcome> {
  const provider = label || "The model";

  const refusal = refuseBeforeSending({ apiKey, text });
  if (refusal) return refusal;
  if (!baseUrl) {
    return { json: null, problems: [`No address is configured for ${provider}.`], usage: null };
  }

  const sent = figures.slice(0, modelMaxFigures);

  const body = {
    // A single user turn: instruction, then the pictures in figure order, then
    // the document text. The same order the Gemini path uses, so a difference in
    // the answer is the model's and not the framing's.
    messages: [
      {
        content: [
          { text: buildModelInstruction(), type: "text" },
          ...sent.map((figure) => ({
            image_url: { url: `data:${figure.mimeType};base64,${figure.base64}` },
            type: "image_url",
          })),
          { text, type: "text" },
        ],
        role: "user",
      },
    ],
    max_tokens: maxTokens,
    model,
    response_format: { type: "json_object" },
    // A question paper has one right reading, and a re-run should give the same
    // answer.
    temperature: 0,
  };

  let lastStatus = 0;
  let lastMessage = "";

  for (let attempt = 1; attempt <= modelMaxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), modelRequestTimeoutMs);
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);

      if (response.ok) {
        const choice = payload?.choices?.[0];
        const answer = typeof choice?.message?.content === "string" ? choice.message.content : "";
        const usageRaw = payload?.usage ?? {};
        const usage = {
          answer: Number(usageRaw.completion_tokens ?? 0),
          prompt: Number(usageRaw.prompt_tokens ?? 0),
          // Some providers report reasoning tokens separately; most do not.
          thinking: Number(usageRaw.completion_tokens_details?.reasoning_tokens ?? 0),
        };

        if (choice?.finish_reason === "length") {
          return { json: null, problems: [truncatedAnswer(provider)], usage };
        }
        if (answer.trim() === "") {
          return { json: null, problems: [emptyAnswer(provider)], usage };
        }
        return { json: answer, problems: [], usage };
      }

      lastStatus = response.status;
      lastMessage = String(payload?.error?.message ?? payload?.message ?? "");
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

  return { json: null, problems: [describeModelFailure(provider, lastStatus, lastMessage)], usage: null };
}
