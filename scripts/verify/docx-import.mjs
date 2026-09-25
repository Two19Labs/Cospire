// The Word upload, driven end to end.
//
// Proves the sentence the feature exists for: *an admin uploads a .docx, its
// pictures land in the question-images bucket, the text comes back with
// [[figure:N]] where each one sat, and after the model's JSON is pasted back
// each marker resolves to the right image on the approved question.*
//
//   node --env-file=.env.local scripts/verify/docx-import.mjs <baseUrl>
//
// Two halves, and it is worth being exact about which is which:
//
//  - **Extraction runs in the browser** (`word-upload-field.tsx`), because no
//    file may pass through the application server (operating manual §8) and a
//    Vercel function's request body is capped far below a question paper. There
//    is no browser automation in this repository, so this script does what the
//    browser does: it runs the *same* `readDocx` -- the real module, imported
//    through the resolve hook below, not a copy -- and then uploads each picture
//    to Storage under a real admin session, byte-identically to the browser.
//  - **Everything after that runs in the build under test**: the paste, the
//    marker resolution, staging, the review screen and approval are all driven
//    over HTTP against `<baseUrl>`.
//
// So this proves the whole path except the React click handler that joins the
// two halves. That is the same limit every harness here has, and it is recorded
// rather than glossed: see the claim list in the pull request.
//
// Cleanup removes only this run's objects, staged rows, questions, sections and
// accounts, and prints the live counts afterwards.

import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { zipSync } from "fflate";

// The feature's own modules are TypeScript, and this script has to run the real
// ones: a harness that reimplements the thing it checks proves only that the
// copy agrees with itself. Node strips the types on its own; all it needs is the
// extension the application's imports leave off.
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
const { buildQuestionImagePath, questionImagesBucket } = await import(featureUrl("storage.ts"));

const BASE = process.argv[2] ?? "http://127.0.0.1:3030";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUB || !SECRET) throw new Error("missing supabase env");

const service = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}

const ORG = 1;
const RIVAL_ORG = 5;
const stamp = Date.now();
const PASSWORD = `DocxVerify${stamp}x`;
const DOC = `Verify docx ${stamp}`;
const QA = `QA ${stamp}`;
const DILR = `DILR ${stamp}`;
const people = {};
const sectionIds = [];
const createdObjects = [];

// ---------------------------------------------------------------------------
// A question paper, as a real .docx
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

// Eight bytes of a PNG. Nothing decodes it; the bucket checks the declared type
// and the size, both of which are what this exercises.
const pngBytes = (seed) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, seed]);

const para = (text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const drawing = (id) =>
  `<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData>` +
  `<pic:pic><pic:blipFill><a:blip r:embed="${id}"/></pic:blipFill></pic:pic>` +
  `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
const chart = (id) => `<w:p><w:r><w:drawing><a:graphicData><c:chart r:id="${id}"/></a:graphicData></w:drawing></w:r></w:p>`;
const cell = (text) => `<w:tc><w:tcPr/>${para(text)}</w:tc>`;
const row = (...values) => `<w:tr>${values.map(cell).join("")}</w:tr>`;

// Deliberately awkward, in the ways a real paper is: a picture the bank can
// take, a second one, an EMF drawing it cannot, a native Word chart it cannot,
// a data table, and a paragraph left in with track changes on.
const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
  para(`Q1. Profit question ${stamp}. Study the figure below.`) +
  drawing("rId4") +
  para("(a) 12.5%  (b) 15%  (c) 10%  (d) 12%") +
  para(`Q2. Half question ${stamp}. Read the shape shown.`) +
  drawing("rId5") +
  `<w:p><w:del><w:r><w:delText>Q2b. This question was deleted ${stamp}.</w:delText></w:r></w:del></w:p>` +
  para(`Directions for Q3-Q4: Sales table ${stamp}.`) +
  `<w:tbl><w:tblPr/>` +
  row("Store", "Q1", "Q2") +
  row("A", "40", "35") +
  row("B", "70", "78") +
  `</w:tbl>` +
  drawing("rId6") +
  chart("rId7") +
  para(`Q3. Store B total ${stamp}?`) +
  para(`Q4. Fastest growth ${stamp}?`) +
  `</w:body></w:document>`;

const relsXml =
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId4" Target="media/image1.png"/>` +
  `<Relationship Id="rId5" Target="media/image2.png"/>` +
  `<Relationship Id="rId6" Target="media/image3.emf"/>` +
  `<Relationship Id="rId7" Target="charts/chart1.xml"/>` +
  `</Relationships>`;

const docxFile = zipSync({
  "[Content_Types].xml": enc.encode(`<?xml version="1.0"?><Types/>`),
  "word/_rels/document.xml.rels": enc.encode(relsXml),
  "word/charts/chart1.xml": enc.encode(`<?xml version="1.0"?><c:chartSpace/>`),
  "word/document.xml": enc.encode(documentXml),
  "word/media/image1.png": pngBytes(1),
  "word/media/image2.png": pngBytes(2),
  "word/media/image3.emf": enc.encode("EMF vector drawing bytes"),
});

// ---------------------------------------------------------------------------
// Plumbing, the same as the other harnesses here
// ---------------------------------------------------------------------------

async function signIn(email) {
  const jar = [];
  const ssr = createServerClient(URL_, PUB, { cookies: { getAll: () => [], setAll: (list) => jar.push(...list) } });
  const { data, error } = await ssr.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return {
    client: createClient(URL_, PUB, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    }),
    cookie: jar.map((c) => `${c.name}=${c.value}`).join("; "),
  };
}

async function createPerson(key, role, orgId = ORG) {
  const email = `docximport-${key}-${stamp}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, password: PASSWORD });
  if (error) throw new Error(`create ${email}: ${error.message}`);
  const { error: pe } = await service
    .from("profiles")
    .insert({ email, id: data.user.id, name: `Docx ${key}`, org_id: orgId, role });
  if (pe) throw new Error(`profile ${email}: ${pe.message}`);
  people[key] = { id: data.user.id, orgId, ...(await signIn(email)) };
}

async function get(path, who) {
  const res = await fetch(`${BASE}${path}`, { headers: who ? { cookie: people[who].cookie } : {}, redirect: "manual" });
  return { body: await res.text(), location: res.headers.get("location"), status: res.status };
}

const forms = (html) => [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);

const decodeEntities = (raw) =>
  raw.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function hiddenFields(formHtml) {
  const fields = [];
  for (const tag of formHtml.matchAll(/<input [^>]*>/g)) {
    if (!/type="hidden"/.test(tag[0])) continue;
    const name = tag[0].match(/name="([^"]*)"/)?.[1];
    if (!name) continue;
    fields.push([decodeEntities(name), decodeEntities(tag[0].match(/value="([^"]*)"/)?.[1] ?? "")]);
  }
  return fields;
}

// `fields` may repeat a name -- the figure map is one input per figure -- so an
// overridden name replaces every hidden copy of itself rather than adding to it.
async function postForm(path, who, formHtml, fields) {
  const body = new FormData();
  const overridden = new Set(fields.map(([name]) => name));
  for (const [k, v] of hiddenFields(formHtml)) if (!overridden.has(k)) body.append(k, v);
  for (const [k, v] of fields) body.append(k, String(v));
  const res = await fetch(`${BASE}${path}`, {
    body,
    headers: { cookie: people[who].cookie, origin: BASE },
    method: "POST",
    redirect: "manual",
  });
  return { body: await res.text(), location: res.headers.get("location"), status: res.status };
}

async function stagedRows() {
  const { data } = await service
    .from("question_imports")
    .select("id, batch_id, position, status, question_id, parsed, problems")
    .eq("source_ref", DOC)
    .order("position");
  return data ?? [];
}

// The browser's upload, done exactly as `word-upload-field.tsx` does it: the
// author's own session, so the question_images_* Storage policies decide.
async function uploadFigure(who, figure) {
  const path = buildQuestionImagePath({
    objectId: crypto.randomUUID(),
    orgId: people[who].orgId,
    type: figure.contentType,
  });
  const { error } = await people[who].client.storage
    .from(questionImagesBucket)
    .upload(path, new Blob([figure.bytes], { type: figure.contentType }), {
      contentType: figure.contentType,
      upsert: false,
    });
  return { error, path };
}

const approveForm = (html, importId) =>
  forms(html).find((form) => form.includes(`name="importId" value="${importId}"`) && form.includes('name="topic"'));

try {
  await createPerson("admin", "admin");
  await createPerson("mentor", "mentor");
  await createPerson("student", "student");
  await createPerson("rival", "admin", RIVAL_ORG);

  for (const name of [QA, DILR]) {
    const { data } = await service.from("question_sections").insert({ name, org_id: ORG }).select("id").single();
    sectionIds.push(data.id);
  }
  const [qaId] = sectionIds;

  // ------------------------------------------------ A. opening the .docx
  const paper = readDocx(docxFile);

  record(
    "the paper's text comes back with a marker where each picture sat, in document order",
    paper.text.includes(`Q1. Profit question ${stamp}`) &&
      /Q1\. Profit question \d+\. Study the figure below\.\n\[\[figure:1\]\]/.test(paper.text) &&
      paper.text.includes("[[figure:2]]") &&
      paper.text.includes("[[figure:3]]") &&
      paper.text.includes("[[figure:4]]"),
    `${paper.text.length} chars`,
  );
  record(
    "a Word table becomes a text table",
    paper.text.includes("| Store | Q1 | Q2 |") && paper.text.includes("| B | 70 | 78 |"),
  );
  record("a paragraph deleted with track changes on is not in the text", !paper.text.includes("This question was deleted"));
  record(
    "two pictures come out with bytes, and the EMF drawing and the Word chart are flagged instead of guessed at",
    paper.figures.length === 4 &&
      paper.figures[0].contentType === "image/png" &&
      paper.figures[1].contentType === "image/png" &&
      paper.figures[2].bytes === null &&
      /EMF/.test(paper.figures[2].note ?? "") &&
      paper.figures[3].bytes === null &&
      /chart/.test(paper.figures[3].note ?? ""),
    paper.figures.map((f) => `${f.n}:${f.contentType ?? f.note}`).join(" | "),
  );
  record(
    "the admin is told which figures must be pasted in by hand",
    paper.notes.some((note) => note.includes("figure 3") && note.includes("figure 4")),
  );

  // ------------------------------------- B. the pictures reach the bucket
  const exportable = paper.figures.filter((figure) => figure.bytes);
  const figurePaths = {};
  for (const figure of exportable) {
    const { error, path } = await uploadFigure("admin", figure);
    if (error) throw new Error(`upload figure ${figure.n}: ${error.message}`);
    figurePaths[figure.n] = path;
    createdObjects.push(path);
  }
  const { data: storedOne } = await service.storage.from(questionImagesBucket).download(figurePaths[1]);
  record(
    "an admin's upload puts both pictures in the bucket under their own organisation",
    Object.keys(figurePaths).length === 2 &&
      Object.values(figurePaths).every((path) => path.startsWith(`org/${ORG}/questions/`)) &&
      storedOne !== null,
  );

  const studentUpload = await uploadFigure("student", exportable[0]);
  const { data: studentObject } = await service.storage.from(questionImagesBucket).download(studentUpload.path);
  record(
    "a student uploading the same picture is refused, and no object is created",
    Boolean(studentUpload.error) && studentObject === null,
    studentUpload.error?.message,
  );

  // The rival admin is in org 5, so buildQuestionImagePath writes org/5/... A
  // path of their own is legal for them; what must fail is reaching into org 1.
  const rivalPath = `org/${ORG}/questions/${crypto.randomUUID()}.png`;
  const { error: rivalError } = await people.rival.client.storage
    .from(questionImagesBucket)
    .upload(rivalPath, new Blob([pngBytes(9)], { type: "image/png" }), { contentType: "image/png" });
  const { data: rivalObject } = await service.storage.from(questionImagesBucket).download(rivalPath);
  record(
    "another organisation's admin cannot put a picture under org 1",
    Boolean(rivalError) && rivalObject === null,
    rivalError?.message,
  );

  // --------------------------------- C. the paste, with the figure map
  const mentorPage = await get("/admin/questions/import", "mentor");
  const studentPage = await get("/admin/questions/import", "student");
  record("mentors and students are turned away from importing", mentorPage.status === 307 && studentPage.status === 307);

  const page = await get("/admin/questions/import", "admin");
  record(
    "the import screen offers the Word step and a prompt that teaches the numbered markers",
    page.status === 200 && page.body.includes("open a Word file") && page.body.includes("[[figure:1]]"),
  );

  // What a model returns, having been given the extracted text: the markers are
  // kept exactly where they were.
  const answer = {
    document: DOC,
    questions: [
      {
        answer: "B", difficulty: "medium", marks: 3, options: ["12.5%", "15%", "10%", "12%"],
        question: `Profit question ${stamp}. Study the figure below.\n[[figure:1]]`,
        section: QA, solution: "Worked.", source: `Q1 source ${stamp}`, topic: "Profit and loss", type: "mcq",
      },
      {
        answer: "0.5", difficulty: "easy", marks: 3,
        question: `Half question ${stamp}. Read the shape shown.\n[[figure:2]]`,
        section: QA, source: `Q2 source ${stamp}`, topic: "Fractions", type: "tita",
      },
      {
        difficulty: "medium",
        passage: `Sales table ${stamp}\n| Store | Q1 | Q2 |\n| B | 70 | 78 |\n[[figure:3]] [[figure:4]]`,
        section: DILR, source: `Set source ${stamp}`, topic: "Tables", type: "di_set",
        questions: [
          { answer: "148", marks: 3, question: `Store B total ${stamp}`, type: "tita" },
          { answer: "C", marks: 3, options: ["A", "B", "C", "D"], question: `Fastest growth ${stamp}`, type: "mcq" },
        ],
      },
    ],
  };
  const PASTED = `Here is the JSON:\n\`\`\`json\n${JSON.stringify(answer, null, 2)}\n\`\`\``;
  const figureFields = Object.entries(figurePaths).map(([n, path]) => ["figures", `${n}:${path}`]);

  const previewForm = forms(page.body).find((form) => form.includes('name="pasted"'));
  if (!previewForm) throw new Error("no paste form");

  const previewed = await postForm("/admin/questions/import", "admin", previewForm, [
    ["pasted", PASTED], ["documentName", DOC], ["defaultMarks", "3"], ...figureFields,
  ]);
  record(
    "reading the paste attaches each marker to its picture and says so",
    previewed.status === 200 && previewed.body.includes("Send 5 for review") && /1 figure attached/.test(previewed.body),
  );
  record("reading a paste still writes nothing", (await stagedRows()).length === 0);

  const stageForm = forms(previewed.body).find((form) => form.includes("Send 5 for review"));
  if (!stageForm) throw new Error("no stage form");

  // -------------------------------------------------- D. a crafted post
  //
  // The figure map arrives on a form, and a Server Action is a public endpoint,
  // so the two things that must not work are tried before the honest post.
  const crafted = await postForm("/admin/questions/import", "admin", stageForm, [
    ...hiddenFields(stageForm).filter(([name]) => name !== "figures").map(([n, v]) => [n, v]),
    ["figures", `1:org/${RIVAL_ORG}/questions/${crypto.randomUUID()}.png`],
    ["figures", "2:../../etc/passwd"],
  ]);
  const craftedRows = await stagedRows();
  record(
    "a post naming another organisation's path, or a path at all outside the shape, attaches nothing",
    craftedRows.length === 5 && craftedRows.every((row) => (row.parsed?.images ?? []).length === 0),
    craftedRows.map((r) => (r.parsed?.images ?? []).length).join(","),
  );
  // That batch is this run's too; clear it so the honest one is unambiguous.
  await service.from("question_imports").delete().eq("source_ref", DOC);
  record("the crafted batch is cleared before the real one", (await stagedRows()).length === 0, `${crafted.status}`);

  // ------------------------------------------------- E. staging for real
  const staged = await postForm("/admin/questions/import", "admin", stageForm, figureFields);
  const rows = await stagedRows();
  const batchId = rows[0]?.batch_id;
  const byPos = Object.fromEntries(rows.map((row) => [row.position, row]));
  record(
    "staging writes one row per question and opens the review screen",
    rows.length === 5 && (staged.location ?? "") === `/admin/questions/import/${batchId}`,
    `${rows.length} rows -> ${staged.location}`,
  );
  record(
    "each marker resolved to the picture it named, and to no other",
    JSON.stringify(byPos[0]?.parsed?.images) === JSON.stringify([figurePaths[1]]) &&
      JSON.stringify(byPos[1]?.parsed?.images) === JSON.stringify([figurePaths[2]]),
    `q1=${JSON.stringify(byPos[0]?.parsed?.images)} q2=${JSON.stringify(byPos[1]?.parsed?.images)}`,
  );
  record(
    "the set names the two figures that could not be exported, carries no image, and is told to paste them in",
    JSON.stringify(byPos[2]?.parsed?.figures) === JSON.stringify([3, 4]) &&
      (byPos[2]?.parsed?.images ?? []).length === 0 &&
      (byPos[2]?.parsed?.notes ?? []).some((note) => /Figures 3, 4 were not taken out/.test(note)),
    JSON.stringify(byPos[2]?.parsed?.notes),
  );
  record(
    "a missing figure is a note, not a problem: the set can still be approved",
    (byPos[2]?.problems ?? []).length === 0,
    JSON.stringify(byPos[2]?.problems),
  );
  record("no marker text survives into any question body", rows.every((row) => !(row.parsed?.body ?? "").includes("[[")));

  // ------------------------------------------------------- F. the review
  const reviewPath = `/admin/questions/import/${batchId}`;
  const review = await get(reviewPath, "admin");
  record(
    "the review screen carries the attached picture as a signed URL the admin can see",
    review.status === 200 &&
      review.body.includes(figurePaths[1]) &&
      /question-images[^"]*token=/.test(review.body.replace(/&amp;/g, "&")),
  );

  const q1Form = approveForm(review.body, byPos[0].id);
  if (!q1Form) throw new Error("no approve form for question 1");
  record(
    "the editor is pre-filled with the attached picture, so approving keeps it without re-uploading",
    q1Form.includes(`name="images"`) && q1Form.includes(figurePaths[1]),
  );

  // ----------------------------------------------------- G. approving it
  const approved = await postForm(reviewPath, "admin", q1Form, [
    ["sectionId", qaId], ["topic", "Profit and loss"], ["difficulty", "medium"], ["marks", "3"],
    ["body", `Profit question ${stamp}`], ["option-0", "12.5%"], ["option-1", "15%"],
    ["option-2", "10%"], ["option-3", "12%"], ["correct", "1"],
  ]);
  const approvedRow = (await stagedRows()).find((row) => row.position === 0);
  const { data: saved } = await service
    .from("questions")
    .select("id, images, section_id")
    .eq("id", approvedRow?.question_id ?? -1)
    .maybeSingle();
  record(
    "the approved question carries the picture the document's figure 1 became",
    approvedRow?.status === "approved" &&
      JSON.stringify(saved?.images) === JSON.stringify([figurePaths[1]]) &&
      saved?.section_id === qaId,
    `${approved.status} -> ${JSON.stringify(saved?.images)}`,
  );

  const { data: stillThere } = await service.storage.from(questionImagesBucket).download(figurePaths[1]);
  record("the object the question points at is really in the bucket", stillThere !== null);

  // ------------------------------------------------ H. who may read it
  const studentReads = await people.student.client.storage.from(questionImagesBucket).download(figurePaths[1]);
  const rivalReads = await people.rival.client.storage.from(questionImagesBucket).download(figurePaths[1]);
  const anonReads = await fetch(`${URL_}/storage/v1/object/${questionImagesBucket}/${figurePaths[1]}`, {
    headers: { apikey: PUB },
  });
  record(
    "a student, another organisation's admin and an anonymous caller are all refused the picture",
    studentReads.data === null && rivalReads.data === null && !anonReads.ok,
    `student=${studentReads.data === null} rival=${rivalReads.data === null} anon=${anonReads.status}`,
  );

  const { data: studentRows } = await people.student.client.from("question_imports").select("id").eq("batch_id", batchId);
  record("a student reads 0 staged rows through the API", (studentRows ?? []).length === 0);
} catch (error) {
  record("run completed without throwing", false, String(error));
} finally {
  await service.from("question_imports").delete().eq("source_ref", DOC);
  if (sectionIds.length) {
    const { data: ours } = await service.from("questions").select("id, parent_id").in("section_id", sectionIds);
    const children = (ours ?? []).filter((q) => q.parent_id !== null).map((q) => q.id);
    const tops = (ours ?? []).filter((q) => q.parent_id === null).map((q) => q.id);
    if (children.length) await service.from("questions").delete().in("id", children);
    if (tops.length) await service.from("questions").delete().in("id", tops);
    await service.from("question_sections").delete().in("id", sectionIds);
  }
  if (createdObjects.length) await service.storage.from(questionImagesBucket).remove(createdObjects);
  for (const person of Object.values(people)) {
    const { error } = await service.auth.admin.deleteUser(person.id);
    if (error) console.log(`  cleanup could not remove ${person.id}: ${error.message}`);
  }

  const counts = {};
  for (const table of ["questions", "question_keys", "question_sections", "question_imports", "profiles", "courses", "documents"]) {
    const { count } = await service.from(table).select("*", { count: "exact", head: true });
    counts[table] = count;
  }
  const { data: leftover } = await service.storage.from(questionImagesBucket).list(`org/${ORG}/questions`, { limit: 1000 });
  console.log("\nlive counts after cleanup:", JSON.stringify(counts));
  console.log(`question-images objects under org/${ORG}/questions:`, (leftover ?? []).length);
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed} of ${results.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
