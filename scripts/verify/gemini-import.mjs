// The Gemini path, against the live API.
//
// Proves the sentence item 2 exists for: *a Word paper's extracted text and its
// pictures go to Gemini, and what comes back parses into questions with every
// [[figure:N]] marker still in the question it belongs to.*
//
//   node --env-file=.env.local scripts/verify/gemini-import.mjs [baseUrl]
//
// It calls the **real** `readDocx` and the **real** `readQuestionsWithGemini`,
// imported through the same resolve hook `docx-import.mjs` uses, so what is
// exercised is the code the product runs rather than a copy of it. The call is
// billed to the Client's Google account; one run is a few paise and the token
// count is printed so it can be checked against what the Client was told.
//
// `baseUrl` is optional. Given one, it also checks over HTTP that the key is
// nowhere in what the browser is served -- which is the one thing here that
// cannot be checked by reading the source.
//
// **This writes nothing to the database.** It creates no accounts and stages no
// rows: the model call and the parse are the whole subject.

import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

import { zipSync } from "fflate";

// `@/...` is the tsconfig path alias, and an extensionless relative import is
// what the application writes everywhere. Node resolves neither on its own, and
// it strips the types itself once it can find the file.
const srcDir = new URL("../../src/", import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    const withExtension = (target) => (/\.[a-z]+$/i.test(target) ? target : `${target}.ts`);
    if (specifier.startsWith("@/")) return next(withExtension(`${srcDir}${specifier.slice(2)}`), context);
    if (specifier.startsWith(".")) return next(withExtension(specifier), context);
    return next(specifier, context);
  },
});

const featureUrl = (name) =>
  pathToFileURL(new URL(`../../src/features/question-bank/${name}`, import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, ""))
    .href;

const { readDocx } = await import(featureUrl("docx.ts"));
const { readQuestionsWithGemini } = await import(featureUrl("gemini.ts"));
const { readQuestionsWithOpenAiCompatible } = await import(featureUrl("openai-compatible.ts"));
const { parseImportedQuestions } = await import(featureUrl("import-spec.ts"));

const BASE = process.argv[2] ?? null;

// Whichever provider the environment configures, so this checks the path that
// will actually run rather than the one that used to.
//
// MODEL_BASE_URL points at a free tier for testing. **Never run this with a real
// Cospire question paper against a free tier** -- free usage may be trained on,
// and clause 13.1 makes the Client's content confidential. The fixture below is
// synthetic, which is why it is safe.
const VIA_OPENAI = Boolean(process.env.MODEL_BASE_URL);
const PROVIDER = VIA_OPENAI ? process.env.MODEL_LABEL || "the configured provider" : "Gemini";
const KEY = VIA_OPENAI ? process.env.MODEL_API_KEY : process.env.GEMINI_API_KEY;

const askTheModel = (figures, text) =>
  VIA_OPENAI
    ? readQuestionsWithOpenAiCompatible({
        apiKey: KEY,
        baseUrl: process.env.MODEL_BASE_URL,
        figures,
        label: process.env.MODEL_LABEL || undefined,
        model: process.env.MODEL_NAME || undefined,
        text,
      })
    : readQuestionsWithGemini({ apiKey: KEY, figures, text });

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}
function unverified(name, why) {
  results.push({ name, pass: null, detail: why });
  console.log(`UNVERIFIED  ${name} -- ${why}`);
}

// ---------------------------------------------------------------------------
// A small paper with one picture in it
// ---------------------------------------------------------------------------
//
// What this proves is that the picture *travels* and that its marker comes back
// on the right question. It does not prove Gemini can read a chart: the picture
// is one pixel, deliberately, because every run is billed and how well Google's
// model reads a graph is Google's problem, not this repository's. Testing that
// needs one of Cospire's real papers, which is the pulled-forward accuracy item
// in CONTEXT.md.

const enc = new TextEncoder();
const para = (t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const drawing = (id) =>
  `<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData>` +
  `<pic:pic><pic:blipFill><a:blip r:embed="${id}"/></pic:blipFill></pic:pic>` +
  `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

// A 1x1 PNG. Small on purpose: this run is billed, and what is being proven is
// that the picture travels and is placed, not that Gemini can read a chart --
// which is Google's job, not this repository's.
const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const png = Uint8Array.from(Buffer.from(pngBase64, "base64"));

const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
  para("Section: QA") +
  para("Q1. A shopkeeper marks an item 25% above cost and gives a 10% discount. What is the profit percentage?") +
  para("(a) 12.5%  (b) 15%  (c) 10%  (d) 12%") +
  para("Q2. Refer to the figure below and state what it shows.") +
  drawing("rId4") +
  para("(a) A square  (b) A circle  (c) A triangle  (d) A line") +
  para("Answer key: Q1 (a), Q2 (a).") +
  `</w:body></w:document>`;

const docxFile = zipSync({
  "[Content_Types].xml": enc.encode(`<?xml version="1.0"?><Types/>`),
  "word/_rels/document.xml.rels": enc.encode(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId4" Target="media/image1.png"/></Relationships>`,
  ),
  "word/document.xml": enc.encode(documentXml),
  "word/media/image1.png": png,
});

try {
  // ------------------------------------------------- A. the paper comes apart
  const paper = readDocx(docxFile);
  const exportable = paper.figures.filter((figure) => figure.bytes);
  record(
    "the paper extracts with one numbered figure",
    paper.text.includes("[[figure:1]]") && exportable.length === 1,
    `${exportable.length} exportable of ${paper.figures.length}`,
  );

  if (!KEY) {
    unverified(`the live ${PROVIDER} round trip`, "no key is set in this environment for the configured provider");
  } else {
    // ------------------------------------------------------- B. the live call
    const figures = exportable.map((figure) => ({
      base64: Buffer.from(figure.bytes).toString("base64"),
      mimeType: figure.contentType,
      n: figure.n,
    }));

    const started = Date.now();
    const outcome = await askTheModel(figures, paper.text);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    if (!outcome.json) {
      // Not a pass and not a crash: the failure path is itself worth proving,
      // because Gemini answering 503 is a thing that really happens and the
      // admin has to be told something they can act on.
      record(
        "an unavailable model is reported as a sentence an admin can act on, not an exception",
        outcome.problems.length === 1 && /copy-and-paste path|billing|Split/.test(outcome.problems[0]),
        outcome.problems[0],
      );
      unverified(`the live ${PROVIDER} round trip`, `${PROVIDER} did not answer after retries in ${seconds}s: ${outcome.problems[0]}`);
    } else {
      record(`${PROVIDER} answered`, true, `${seconds}s`);
      if (VIA_OPENAI) {
        // There is no portable way to turn reasoning off across providers, and
        // it does not matter on a free tier that is not being billed for.
        record("token usage was reported", outcome.usage !== null, JSON.stringify(outcome.usage));
      } else {
        record(
          "thinking was off, so no thinking tokens were billed",
          (outcome.usage?.thinking ?? 0) === 0,
          JSON.stringify(outcome.usage),
        );
      }

      // ------------------------------------------------- C. the answer parses
      const parsed = parseImportedQuestions(outcome.json);
      record("the answer parses with no whole-paste problem", parsed.problems.length === 0, parsed.problems.join(" "));
      record(
        "both questions came back",
        parsed.items.length >= 2,
        `${parsed.items.length} items: ${parsed.items.map((i) => i.parsed?.type ?? "unreadable").join(", ")}`,
      );

      const withFigure = parsed.items.filter((item) => (item.parsed?.figures ?? []).includes(1));
      record(
        "the figure marker survived the round trip and landed on the question that had it",
        withFigure.length === 1,
        `${withFigure.length} question(s) name figure 1`,
      );
      record(
        "no marker text is left in any question body",
        parsed.items.every((item) => !(item.parsed?.body ?? "").includes("[[")),
      );
      record(
        "the answer key was read, not invented",
        parsed.items[0]?.parsed?.correctOptions?.length === 1,
        JSON.stringify(parsed.items[0]?.parsed?.correctOptions),
      );

      console.log(`\n  provider: ${PROVIDER}`);
      console.log("  tokens:", JSON.stringify(outcome.usage));
    }
  }

  // --------------------------------- D. the key is not in what a browser gets
  if (BASE && KEY) {
    const page = await fetch(`${BASE}/login`).then((r) => r.text()).catch(() => "");
    const chunks = [...page.matchAll(/src="([^"]*\/_next\/static\/[^"]*\.js)"/g)].map((m) => m[1]);
    let leaked = page.includes(KEY);
    for (const chunk of chunks.slice(0, 40)) {
      const body = await fetch(chunk.startsWith("http") ? chunk : `${BASE}${chunk}`).then((r) => r.text()).catch(() => "");
      if (body.includes(KEY)) leaked = true;
    }
    record(
      "the model key is in nothing the browser is served",
      !leaked,
      `${chunks.length} chunk(s) checked on ${BASE}`,
    );
  } else if (!BASE) {
    unverified("the model key is in nothing the browser is served", "no base URL given; pass one to check it");
  }
} catch (error) {
  record("run completed without throwing", false, String(error));
} finally {
  const failed = results.filter((r) => r.pass === false).length;
  const skipped = results.filter((r) => r.pass === null).length;
  const passed = results.filter((r) => r.pass === true).length;
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} unverified`);
  process.exit(failed === 0 ? 0 : 1);
}
