// Mock-first import with duplicate detection, driven over HTTP (Phase 6.2-6.4).
//
// node --env-file=.env.local scripts/verify/mock-import.mjs <baseUrl>
//
// Proves, against the hosted database and a running build:
//   - a paper is staged with a verdict per question, compared with the bank and
//     with itself, and pictures are compared by content (D22-D24);
//   - "approve all clean" approves what needs no decision and leaves every
//     flagged question for a person (O3);
//   - a missing section is created from the review screen (D14);
//   - a mock is built from the paper, with marks on its sections (D19), its DI
//     set whole, and its students granted (D7, D13);
//   - "same question" links without creating anything, "corrected version"
//     updates the existing question, and a link the verdict never offered is
//     refused.
//
// The staging action is called exactly as the browser calls it: its id from the
// build's server-reference manifest, its arguments encoded with React's own
// encodeReply. Every other action is posted from the form the page rendered.
//
// The papers are synthetic; no model is called. Cleanup removes only this run's
// rows, pictures and accounts, then prints live counts.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const require = createRequire(import.meta.url);
const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/client.node");

const BASE = process.argv[2] ?? "http://127.0.0.1:3030";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUB || !SECRET) throw new Error("missing Supabase env");

const service = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const manifest = JSON.parse(readFileSync(new URL("../../.next/server/server-reference-manifest.json", import.meta.url), "utf8"));
const actionId = (name) => {
  const entry = Object.entries(manifest.node).find(([, value]) => value.exportedName === name);
  if (!entry) throw new Error(`no server action called ${name} in the build`);
  return entry[0];
};

const ORG = 1;
const stamp = Date.now();
const PASSWORD = `MockImportVerify${stamp}x`;
const people = {};
const made = { batches: [], images: [], mocks: [], sections: [] };

const results = [];
function record(name, pass, detail) {
  results.push({ detail, name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}

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

async function createPerson(key, role) {
  const email = `mockimport-${key}-${stamp}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, password: PASSWORD });
  if (error) throw new Error(`create ${email}: ${error.message}`);
  const { error: pe } = await service.from("profiles").insert({ email, id: data.user.id, name: `MockImport ${key}`, org_id: ORG, role });
  if (pe) throw new Error(`profile ${email}: ${pe.message}`);
  people[key] = { id: data.user.id, ...(await signIn(email)) };
}

async function get(path, who) {
  const res = await fetch(`${BASE}${path}`, { headers: who ? { cookie: people[who].cookie } : {}, redirect: "manual" });
  return { body: await res.text(), location: res.headers.get("location"), status: res.status };
}

function decodeEntities(raw) {
  return raw.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function forms(html) {
  return [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
}

// Every value a form would post as rendered: hidden and text inputs, checked
// boxes and radios, textareas, and each select's selected option.
function formValues(formHtml) {
  const fields = [];
  for (const tag of formHtml.matchAll(/<input [^>]*>/g)) {
    const name = tag[0].match(/name="([^"]*)"/)?.[1];
    if (!name) continue;
    const type = tag[0].match(/type="([^"]*)"/)?.[1] ?? "text";
    if ((type === "checkbox" || type === "radio") && !/ checked/.test(tag[0])) continue;
    if (type === "submit" || type === "file") continue;
    fields.push([decodeEntities(name), decodeEntities(tag[0].match(/value="([^"]*)"/)?.[1] ?? (type === "checkbox" ? "on" : ""))]);
  }
  for (const area of formHtml.matchAll(/<textarea [^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/textarea>/g)) {
    fields.push([decodeEntities(area[1]), decodeEntities(area[2])]);
  }
  for (const select of formHtml.matchAll(/<select [^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const chosen = select[2].match(/<option[^>]*selected[^>]*value="([^"]*)"/) ?? select[2].match(/<option[^>]*value="([^"]*)"[^>]*selected/) ?? select[2].match(/<option[^>]*value="([^"]*)"/);
    fields.push([decodeEntities(select[1]), decodeEntities(chosen?.[1] ?? "")]);
  }
  return fields;
}

// Posts a rendered form with some fields replaced (every copy of a replaced name
// is dropped first) and some added.
async function postForm(path, who, formHtml, replace = [], add = []) {
  const body = new FormData();
  const replaced = new Set(replace.map(([name]) => name));
  for (const [k, v] of formValues(formHtml)) if (!replaced.has(k)) body.append(k, v);
  for (const [k, v] of [...replace, ...add]) body.append(k, String(v));
  const res = await fetch(`${BASE}${path}`, { body, headers: { cookie: people[who].cookie, origin: BASE }, method: "POST", redirect: "manual" });
  return { body: await res.text(), location: res.headers.get("location"), status: res.status };
}

// A useActionState action, called as the browser calls it.
async function callAction(path, who, name, fields) {
  const formData = new FormData();
  for (const [k, v] of fields) formData.append(k, String(v));
  const initial = { defaultMarks: "", documentName: "", items: null, pasted: "", problems: [] };
  const body = await encodeReply([initial, formData]);
  const res = await fetch(`${BASE}${path}`, {
    body,
    headers: { accept: "text/x-component", cookie: people[who].cookie, "next-action": actionId(name), origin: BASE },
    method: "POST",
    redirect: "manual",
  });
  const text = await res.text();
  return { body: text, redirect: res.headers.get("x-action-redirect") ?? res.headers.get("location"), status: res.status };
}

async function stagedRows(batchId) {
  const { data } = await service.from("question_imports").select("id, position, parsed, status, question_id, problems").eq("batch_id", batchId).order("position");
  return data ?? [];
}

// Distinct bytes for each picture, so "same text, different figure" is real.
const png = (seed) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed, seed, seed, seed]);
async function uploadFigure(seed) {
  const path = `org/${ORG}/questions/${crypto.randomUUID()}.png`;
  const { error } = await people.admin.client.storage.from("question-images").upload(path, new Blob([png(seed)], { type: "image/png" }));
  if (error) throw new Error(`upload figure: ${error.message}`);
  made.images.push(path);
  return path;
}

const QA = `VQA ${stamp}`;
const DI = `VDI ${stamp}`;
// A short tag, not the whole stamp: a long shared suffix would add the same
// trigrams to every question and make unrelated ones look alike.
const tag = stamp.toString(36).slice(-5);
const t = (text) => `${text} #${tag}`;

// Wording chosen to resemble nothing in `C:\Cospire\Test Documents`, which an
// admin may have imported into the same organisation: the harness must measure
// its own papers against each other, not against someone's real bank.
const paperA = {
  document: `Verify paper A ${stamp}`,
  questions: [
    { answer: "B", difficulty: "easy", options: ["20%", "25%", "30%", "35%"], question: t("Lilies costing 296 rupees in total were sold on for 370 rupees by a florist. Find the gain as a percent."), section: QA, topic: "Profit", type: "mcq" },
    { answer: "B", difficulty: "medium", options: ["8", "10", "12", "15"], question: t("Pipe P fills a cistern in 14 hours and pipe Q in 35 hours. Working together, how many hours do they take?"), section: QA, topic: "Pipes", type: "mcq" },
    { answer: "2", difficulty: "easy", question: t("Solve for y when seven y minus nine equals five."), section: QA, topic: "Equations", type: "tita" },
    { answer: "A", difficulty: "medium", options: ["40 − 4π", "40 − 8π", "4π", "20 − 4π"], question: t("The diagram shows rectangle PQRS, eight metres by five, with a circular pond cut out. What area is lawn? [[figure:1]]"), section: QA, topic: "Mensuration", type: "mcq" },
    { answer: "52", difficulty: "easy", question: t("Calculate the medain of 31, 47, 52, 58 and 66."), section: QA, topic: "Statistics", type: "tita" },
    {
      difficulty: "medium",
      passage: t("Monthly rainfall in millimetres at weather stations K, L, M and N is recorded over four quarters of one year."),
      questions: [
        { answer: "140", question: t("What was the yearly rainfall at station L?"), type: "tita" },
        { answer: "C", options: ["K", "L", "M", "N"], question: t("Which station's rainfall varied the most between quarters?"), type: "mcq" },
      ],
      section: DI,
      topic: "Charts",
      type: "di_set",
    },
  ],
};

const paperB = {
  document: `Verify paper B ${stamp}`,
  questions: [
    paperA.questions[0],
    { ...paperA.questions[1], answer: "C", options: ["8", "12", "10", "15"], question: t("Pipe P fills a cistern in 14 Hours and pipe Q in 35 Hours.  Working together, how many hours do they take?") },
    { ...paperA.questions[2], answer: "3", question: t("Solve for y when seven y minus nine equals twelve.") },
    { ...paperA.questions[4], question: t("Calculate the median of 31, 47, 52, 58 and 66.") },
    { ...paperA.questions[3], answer: "C" },
    { answer: "24", difficulty: "easy", question: t("A cyclist covers 84 kilometres in three and a half hours. Find the cycling speed."), section: QA, topic: "Speed", type: "tita" },
    { answer: "24", difficulty: "easy", question: t("A cyclist covers 84 kilometres in three and a half hours. Find the cycling speed."), section: QA, topic: "Speed", type: "tita" },
    paperA.questions[5],
  ],
};

async function stage(paper, figurePath, { buildMock }) {
  const fields = [
    ["pasted", JSON.stringify(paper)],
    ["documentName", paper.document],
    ["defaultMarks", "1"],
    ["paperSection", ""],
    ["defaultDifficulty", ""],
    ["buildMock", buildMock ? "1" : ""],
  ];
  if (figurePath) fields.push(["figures", `1:${figurePath}`]);
  const res = await callAction(buildMock ? "/admin/mocks/import-paper" : "/admin/questions/import", "admin", "stageQuestionImportAction", fields);
  const batchId = res.redirect?.match(/import\/([0-9a-f-]{36})/)?.[1] ?? null;
  if (batchId) made.batches.push(batchId);
  return { batchId, res };
}

try {
  await createPerson("admin", "admin");
  await createPerson("student", "student");
  await createPerson("other", "student");

  const { data: qaSection, error: sectionError } = await service.from("question_sections").insert({ name: QA, org_id: ORG }).select("id").single();
  if (sectionError) throw new Error(`section: ${sectionError.message}`);
  made.sections.push(qaSection.id);
  const figureA = await uploadFigure(1);
  const figureB = await uploadFigure(2);

  // ------------------------------------------------------------ A. the entry
  const mocks = await get("/admin/mocks", "admin");
  record("Mock tests offers Import a paper as its main action", mocks.status === 200 && mocks.body.includes('href="/admin/mocks/import-paper"'));
  const wizard = await get("/admin/mocks/import-paper", "admin");
  record(
    "the wizard opens on step 1 alone, with the paste route still reachable",
    wizard.status === 200 && wizard.body.includes("Step 1") && !wizard.body.includes("Step 3 — check") && wizard.body.includes("Paste a model"),
    String(wizard.status),
  );
  const studentWizard = await get("/admin/mocks/import-paper", "student");
  record("a student is turned away from the wizard", studentWizard.status === 307, String(studentWizard.status));

  // ------------------------------------------------------- B. paper A staged
  const { batchId: batchA, res: stageA } = await stage(paperA, figureA, { buildMock: true });
  record("paper A stages and goes to its review with the mock step open", Boolean(batchA) && /\?mock=1/.test(stageA.redirect ?? ""), stageA.redirect ?? `${stageA.status}`);
  const rowsA = await stagedRows(batchA);
  record(
    "every question of a first paper is judged new",
    rowsA.length === 8 && rowsA.every((row) => row.parsed?.duplicate?.kind === "new"),
    rowsA.map((row) => row.parsed?.duplicate?.kind).join(","),
  );

  let review = await get(`/admin/questions/import/${batchA}?mock=1`, "admin");
  record(
    "the review offers to create the section the paper names and the bank lacks",
    review.status === 200 && review.body.includes(`Create “${DI}”`),
    String(review.status),
  );
  record("the build step waits while questions are undecided", review.body.includes("still to decide"));

  let approveAll = forms(review.body).find((form) => form.includes("Approve all clean"));
  let res = await postForm(`/admin/questions/import/${batchA}?mock=1`, "admin", approveAll);
  let afterA = await stagedRows(batchA);
  record(
    "approve all clean approves the QA questions and leaves the set whose section is missing",
    afterA.filter((row) => row.status === "approved").length === 5 && afterA.slice(5).every((row) => row.status === "pending_review"),
    afterA.map((row) => row.status[0]).join(""),
  );

  const createForm = forms(review.body).find((form) => form.includes(`Create “${DI}”`));
  res = await postForm(`/admin/questions/import/${batchA}?mock=1`, "admin", createForm);
  const { data: diSection } = await service.from("question_sections").select("id").eq("org_id", ORG).eq("name", DI).maybeSingle();
  if (diSection) made.sections.push(diSection.id);
  record("the missing section is created from the review screen", Boolean(diSection) && /section-created/.test(res.location ?? ""), res.location ?? "");

  review = await get(`/admin/questions/import/${batchA}?mock=1`, "admin");
  approveAll = forms(review.body).find((form) => form.includes("Approve all clean"));
  res = await postForm(`/admin/questions/import/${batchA}?mock=1`, "admin", approveAll);
  afterA = await stagedRows(batchA);
  const idA = Object.fromEntries(afterA.map((row) => [row.position, row.question_id]));
  const { data: setChildren } = await service.from("questions").select("id, parent_id").eq("parent_id", idA[5] ?? 0);
  record(
    "with the section created, the DI set approves too, its sub-questions inside it",
    afterA.every((row) => row.status === "approved") && setChildren?.length === 2,
    `${afterA.map((row) => row.status[0]).join("")}, children ${setChildren?.length}`,
  );

  // ---------------------------------------------------------- C. build mock
  review = await get(`/admin/questions/import/${batchA}?mock=1`, "admin");
  const buildForm = forms(review.body).find((form) => form.includes(`$ACTION_ID_${actionId("buildMockFromImportAction")}`));
  record("the build step opens once every question is decided", Boolean(buildForm));
  res = await postForm(`/admin/questions/import/${batchA}?mock=1`, "admin", buildForm, [
    ["title", `Verify mock ${stamp}`],
    ["durationMinutes", "20"],
    ["marks", "1"],
    ["negativeMarking", "1"],
    ["timingMode", "sectional"],
    [`minutes_${qaSection.id}`, "12"],
    [`minutes_${diSection?.id}`, "8"],
  ], [["studentId", people.student.id]]);
  const mockId = Number(res.location?.match(/\/admin\/mocks\/(\d+)/)?.[1] ?? 0);
  if (mockId) made.mocks.push(mockId);
  const { data: builtSections } = await service.from("mock_sections").select("id, title, duration_minutes, marks").eq("mock_id", mockId).order("sort_order");
  const { data: placed } = await service.from("mock_questions").select("question_id").eq("mock_id", mockId);
  const { data: grants } = await service.from("content_access").select("student_id").eq("resource_type", "mock").eq("resource_id", mockId);
  record("the mock is built and the admin lands on it", mockId > 0 && /notice=built/.test(res.location ?? ""), res.location ?? `${res.status}`);
  record(
    "its sections follow the paper, timed as asked, each carrying 1 mark per correct answer (D19)",
    builtSections?.map((s) => `${s.title}:${s.duration_minutes}:${Number(s.marks)}`).join("|") === `${QA}:12:1|${DI}:8:1`,
    builtSections?.map((s) => `${s.title}:${s.duration_minutes}:${s.marks}`).join("|"),
  );
  record("every question is placed, the DI set whole (5 + passage + 2)", placed?.length === 8, String(placed?.length));
  record(
    "the picked student is granted it, and nobody else",
    grants?.length === 1 && grants[0].student_id === people.student.id,
    JSON.stringify(grants),
  );

  // ------------------------------------------------- D. paper B, duplicates
  const questionCountBefore = (await service.from("questions").select("id", { count: "exact", head: true }).eq("org_id", ORG)).count;
  const { batchId: batchB } = await stage(paperB, figureB, { buildMock: false });
  const rowsB = await stagedRows(batchB);
  const kinds = rowsB.map((row) => row.parsed?.duplicate?.kind);
  const verdictOf = (position) => rowsB.find((row) => row.position === position)?.parsed?.duplicate;
  record(
    "paper B is judged row by row as the decision table says",
    kinds.join(",") === "same,possible,possible,possible,possible,new,repeat,same,same,same",
    kinds.join(","),
  );
  record("the exact copy names paper A's question", verdictOf(0)?.questionId === idA[0], JSON.stringify(verdictOf(0)));
  record(
    "the same text with a different figure is flagged, not linked: pictures are compared by content",
    verdictOf(4)?.kind === "possible" && verdictOf(4)?.candidates?.[0]?.questionId === idA[3],
    JSON.stringify(verdictOf(4)),
  );
  record("the repeat inside the paper points at its first appearance", verdictOf(6)?.position === 5, JSON.stringify(verdictOf(6)));
  record("the DI set links whole, passage and sub-questions", verdictOf(7)?.questionId === idA[5] && [8, 9].every((p) => verdictOf(p)?.kind === "same"));

  review = await get(`/admin/questions/import/${batchB}`, "admin");
  approveAll = forms(review.body).find((form) => form.includes("Approve all clean"));
  record("the clean count leaves out the four flagged questions", review.body.includes("Approve all clean (6)"), review.body.match(/Approve all clean \(\d+\)/)?.[0]);
  await postForm(`/admin/questions/import/${batchB}`, "admin", approveAll);
  const afterB = await stagedRows(batchB);
  const statusB = afterB.map((row) => row.status[0]).join("");
  const questionCountAfter = (await service.from("questions").select("id", { count: "exact", head: true }).eq("org_id", ORG)).count;
  record("approve all clean decides six and leaves the four flagged for a person", statusB === "appppaaaaa", statusB);
  record(
    "only the one new question was created; the copy, the repeat and the set were linked",
    questionCountAfter - questionCountBefore === 1 && afterB[0].question_id === idA[0] && afterB[6].question_id === afterB[5].question_id && afterB[7].question_id === idA[5],
    `created ${questionCountAfter - questionCountBefore}`,
  );

  // ----------------------------------------- E. a person decides the rest
  review = await get(`/admin/questions/import/${batchB}`, "admin");
  const rowB1 = afterB[1];
  // React writes `type` first on a hidden input.
  const importField = (id) => `type="hidden" name="importId" value="${id}"`;
  const linkB1 = forms(review.body).find((form) => form.includes(importField(rowB1.id)) && form.includes(`$ACTION_ID_${actionId("linkImportAction")}`));
  await postForm(`/admin/questions/import/${batchB}`, "admin", linkB1);
  const linked = (await stagedRows(batchB))[1];
  record("“same question” links the reordered copy to paper A's question, creating nothing", linked.status === "approved" && linked.question_id === idA[1]);

  const rowB2 = afterB[2];
  const forged = forms(review.body).find((form) => form.includes(importField(rowB2.id)) && form.includes(`$ACTION_ID_${actionId("linkImportAction")}`));
  await postForm(`/admin/questions/import/${batchB}`, "admin", forged, [["questionId", String(idA[0])]]);
  const stillPending = (await stagedRows(batchB))[2];
  record("a link the verdict never offered is refused", stillPending.status === "pending_review", stillPending.status);

  const rowB3 = afterB[3];
  const editor = forms(review.body).find((form) => form.includes(importField(rowB3.id)) && form.includes("corrected version"));
  const corrected = await postForm(`/admin/questions/import/${batchB}`, "admin", editor, [], [["intoQuestionId", String(idA[4])]]);
  const correctedRow = (await stagedRows(batchB))[3];
  const { data: correctedQuestion } = await service.from("questions").select("body").eq("id", idA[4]).single();
  record(
    "“corrected version” updates paper A's question in place and approves against it",
    correctedRow.status === "approved" && correctedRow.question_id === idA[4] && correctedQuestion?.body.includes("median") && !correctedQuestion?.body.includes("medain"),
    `${correctedRow.status} ${corrected.status}`,
  );

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed} of ${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
} finally {
  if (made.mocks.length) {
    await service.from("content_access").delete().eq("resource_type", "mock").in("resource_id", made.mocks);
    await service.from("mocks").delete().in("id", made.mocks);
  }
  const questionIds = new Set();
  for (const batchId of made.batches) for (const row of await stagedRows(batchId)) if (row.question_id) questionIds.add(row.question_id);
  // Only questions this run created: every one carries the run's tag.
  const { data: ours } = await service.from("questions").select("id").eq("org_id", ORG).like("body", `%#${tag}%`);
  for (const row of ours ?? []) questionIds.add(row.id);
  if (made.batches.length) await service.from("question_imports").delete().in("batch_id", made.batches);
  if (questionIds.size) {
    const ids = [...questionIds];
    await service.from("rescore_events").delete().in("question_id", ids);
    await service.from("question_keys").delete().in("question_id", ids);
    await service.from("questions").delete().in("id", ids).not("parent_id", "is", null);
    await service.from("questions").delete().in("id", ids);
  }
  if (made.sections.length) await service.from("question_sections").delete().in("id", made.sections);
  if (made.images.length) await service.storage.from("question-images").remove(made.images);
  for (const person of Object.values(people)) {
    await service.from("content_access").delete().eq("student_id", person.id);
    await service.from("profiles").delete().eq("id", person.id);
    await service.auth.admin.deleteUser(person.id);
  }
  const counts = {};
  for (const table of ["mocks", "mock_sections", "mock_questions", "questions", "question_keys", "question_sections", "question_imports", "content_access", "profiles"]) {
    const { count } = await service.from(table).select("*", { count: "exact", head: true });
    counts[table] = count;
  }
  console.log(`live counts after cleanup: ${JSON.stringify(counts)}`);
}
