// The question importer, driven over HTTP.
//
// Proves Phase 3 PR 3 against a running application and the hosted database:
// a model's answer is pasted, previewed without writing anything, staged for
// review, and only reaches the bank one approved question at a time -- the
// admin review Annexure A requires. Every refusal is proven by counting rows.
//
// node --env-file=.env.local scripts/verify/question-import.mjs <baseUrl>
//
// Cleanup removes only this run's staged rows, questions, sections and
// accounts, and prints the live counts afterwards.

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? "http://127.0.0.1:3001";
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
const stamp = Date.now();
const PASSWORD = `ImportVerify${stamp}x`;
const DOC = `Verify import ${stamp}`;
const QA = `QA ${stamp}`;
const DILR = `DILR ${stamp}`;
const people = {};
const sectionIds = [];

// What a model returns for a small paper: an MCQ, a TITA with no marks, a DI
// set with a figure and two parts, an essay this bank cannot hold, and an MCQ
// whose answer the document never gave. Wrapped in prose and a fence, as
// models do.
const answer = {
  document: DOC,
  questions: [
    {
      answer: "B", difficulty: "medium", marks: 3, options: ["12.5%", "15%", "10%", "12%"],
      question: `Profit question ${stamp}`, section: QA, solution: "Worked.", source: `Q1 source ${stamp}`,
      topic: "Profit and loss", type: "mcq",
    },
    {
      answer: "0.5 or 1/2", difficulty: "easy", question: `Half question ${stamp}`, section: QA,
      source: `Q2 source ${stamp}`, topic: "Fractions", type: "tita",
    },
    {
      difficulty: "medium", passage: `Sales table ${stamp}\n[[figure]]`, section: DILR, source: `Set source ${stamp}`,
      topic: "Tables", type: "di_set",
      questions: [
        { answer: "148", marks: 3, question: `Store B total ${stamp}`, type: "tita" },
        { answer: "C", marks: 3, options: ["A", "B", "C", "D"], question: `Fastest growth ${stamp}`, type: "mcq" },
      ],
    },
    { answer: "n/a", difficulty: "easy", question: `Write an essay ${stamp}`, section: QA, topic: "Writing", type: "essay" },
    {
      difficulty: "hard", marks: 3, options: ["x", "y"], question: `No key ${stamp}`, section: QA, topic: "Logic", type: "mcq",
    },
  ],
};
const PASTED = `Here is the JSON:\n\`\`\`json\n${JSON.stringify(answer, null, 2)}\n\`\`\`\nLet me know if you need changes.`;

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
  const email = `qimport-${key}-${stamp}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, password: PASSWORD });
  if (error) throw new Error(`create ${email}: ${error.message}`);
  const { error: pe } = await service.from("profiles").insert({ email, id: data.user.id, name: `Import ${key}`, org_id: ORG, role });
  if (pe) throw new Error(`profile ${email}: ${pe.message}`);
  people[key] = { id: data.user.id, ...(await signIn(email)) };
}

async function get(path, who) {
  const res = await fetch(`${BASE}${path}`, { headers: who ? { cookie: people[who].cookie } : {}, redirect: "manual" });
  return { body: await res.text(), location: res.headers.get("location"), status: res.status };
}

function forms(html) {
  return [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
}

function decodeEntities(raw) {
  return raw.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

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
    .select("id, batch_id, position, status, question_id, parsed, problems, reviewed_by")
    .eq("source_ref", DOC)
    .order("position");
  return data ?? [];
}

async function questionCount() {
  const { count } = await service.from("questions").select("id", { count: "exact", head: true }).in("section_id", sectionIds);
  return count ?? 0;
}

// The editor form for one staged row, found by its hidden importId.
function approveForm(html, importId) {
  return forms(html).find((form) => form.includes(`name="importId" value="${importId}"`) && form.includes('name="topic"'));
}

function rejectForm(html, importId) {
  return forms(html).find((form) => form.includes(`name="importId" value="${importId}"`) && !form.includes('name="topic"'));
}

try {
  await createPerson("admin", "admin");
  await createPerson("mentor", "mentor");
  await createPerson("student", "student");

  for (const name of [QA, DILR]) {
    const { data } = await service.from("question_sections").insert({ name, org_id: ORG }).select("id").single();
    sectionIds.push(data.id);
  }
  const [qaId, dilrId] = sectionIds;

  // ------------------------------------------------------------ A. who gets in
  const mentorPage = await get("/admin/questions/import", "mentor");
  const studentPage = await get("/admin/questions/import", "student");
  record("mentors and students are turned away from importing", mentorPage.status === 307 && studentPage.status === 307);

  const page = await get("/admin/questions/import", "admin");
  record(
    "the import screen loads with the prompt to copy",
    page.status === 200 && page.body.includes("di_set") && page.body.includes("[[figure]]"),
  );
  const previewForm = forms(page.body).find((form) => form.includes('name="pasted"'));
  if (!previewForm) throw new Error("no paste form");

  // ------------------------------------------------------- B. reading a paste
  const previewed = await postForm("/admin/questions/import", "admin", previewForm, [
    ["pasted", PASTED], ["documentName", DOC], ["defaultMarks", "3"],
  ]);
  record(
    "reading a paste wrapped in prose and a fence shows all seven entries",
    previewed.status === 200 && previewed.body.includes("Send 7 for review") && previewed.body.includes(`Fastest growth ${stamp}`),
  );
  record("reading a paste writes nothing", (await stagedRows()).length === 0);

  const garbage = await postForm("/admin/questions/import", "admin", previewForm, [["pasted", "Sorry, I cannot open that file."]]);
  record("a paste with no JSON is refused with a sentence", garbage.body.includes("There is no JSON in what you pasted"));

  const stageForm = forms(previewed.body).find((form) => form.includes("Send 7 for review"));
  if (!stageForm) throw new Error("no stage form");

  const mentorStage = await postForm("/admin/questions/import", "mentor", stageForm, []);
  record("a mentor posting the stage action stages nothing", (await stagedRows()).length === 0, `${mentorStage.status}`);

  // ------------------------------------------------------------- C. staging
  const staged = await postForm("/admin/questions/import", "admin", stageForm, []);
  const rows = await stagedRows();
  const batchId = rows[0]?.batch_id;
  record(
    "staging writes one pending row per entry, in one batch, and opens the review screen",
    rows.length === 7 &&
      rows.every((row) => row.status === "pending_review" && row.batch_id === batchId) &&
      (staged.location ?? "") === `/admin/questions/import/${batchId}`,
    `${rows.length} rows -> ${staged.location}`,
  );
  record("nothing is in the bank yet", (await questionCount()) === 0);

  const byPos = Object.fromEntries(rows.map((row) => [row.position, row]));
  record(
    "default marks fill only the question that had none",
    byPos[1].parsed.marks === "3" && byPos[0].parsed.marks === "3" && byPos[2].parsed.marks === "0",
  );
  record(
    "the essay is staged as unreadable and the unanswered MCQ carries its problem",
    byPos[5].parsed === null && byPos[6].problems.some((p) => p.includes("no answer was given")),
  );
  record(
    "the set's figure is flagged and its marker removed",
    byPos[2].parsed.notes.some((n) => n.includes("figure")) && !byPos[2].parsed.body.includes("[["),
  );

  const { data: studentView } = await people.student.client.from("question_imports").select("id").eq("batch_id", batchId);
  const { data: mentorView } = await people.mentor.client.from("question_imports").select("id").eq("batch_id", batchId);
  record("a student and a mentor read 0 staged rows through the API", (studentView ?? []).length === 0 && (mentorView ?? []).length === 0);

  // ------------------------------------------------------------ D. approving
  const reviewPath = `/admin/questions/import/${batchId}`;
  let review = await get(reviewPath, "admin");
  record(
    "the review screen shows each question beside its source text",
    review.status === 200 && review.body.includes(`Q1 source ${stamp}`) && review.body.includes(`Profit question ${stamp}`),
  );

  const q1Form = approveForm(review.body, byPos[0].id);
  const q1Fields = [
    ["sectionId", qaId], ["topic", "Profit and loss"], ["difficulty", "medium"], ["marks", "3"],
    ["body", `Profit question ${stamp}`], ["option-0", "12.5%"], ["option-1", "15%"], ["option-2", "10%"],
    ["option-3", "12%"], ["correct", "1"], ["solution", "Worked."],
  ];
  const approved = await postForm(reviewPath, "admin", q1Form, q1Fields);
  const afterQ1 = await stagedRows();
  const q1Row = afterQ1.find((row) => row.position === 0);
  const { data: q1Key } = await service.from("question_keys").select("correct_answer").eq("question_id", q1Row.question_id ?? -1);
  record(
    "approving writes the question and its key, marks the row approved and stamps the reviewer",
    q1Row.status === "approved" &&
      q1Row.reviewed_by === people.admin.id &&
      JSON.stringify(q1Key?.[0]?.correct_answer) === '{"options":["b"]}' &&
      (approved.location ?? "").includes("notice=approved"),
    `-> ${approved.location}`,
  );

  const twice = await postForm(reviewPath, "admin", q1Form, q1Fields);
  record(
    "approving the same row again is refused and creates no duplicate",
    twice.body.includes("already been decided") && (await questionCount()) === 1,
  );

  const mentorApprove = await postForm(reviewPath, "mentor", approveForm(review.body, byPos[1].id), [
    ["topic", "Fractions"], ["difficulty", "easy"], ["marks", "3"], ["body", `Half question ${stamp}`], ["accepted", "0.5"], ["sectionId", qaId],
  ]);
  record(
    "a mentor posting the approve action changes nothing",
    (await stagedRows()).find((row) => row.position === 1).status === "pending_review" && (await questionCount()) === 1,
    `${mentorApprove.status}`,
  );

  // A crafted post claiming another type: the staged type wins.
  const q2 = await postForm(reviewPath, "admin", approveForm(review.body, byPos[1].id), [
    ["type", "mcq"], ["sectionId", qaId], ["topic", "Fractions"], ["difficulty", "easy"], ["marks", "3"],
    ["body", `Half question ${stamp}`], ["accepted", "0.5\n1/2"],
  ]);
  const q2Row = (await stagedRows()).find((row) => row.position === 1);
  const { data: q2Question } = await service.from("questions").select("type").eq("id", q2Row.question_id ?? -1);
  record(
    "a post claiming a different type is saved as the staged type",
    q2Question?.[0]?.type === "numerical",
    `${q2.location}; type ${q2Question?.[0]?.type}`,
  );

  // A sub-question before its passage.
  const early = await postForm(reviewPath, "admin", q1Form, [
    ...q1Fields.filter(([name]) => name !== "body"), ["body", `Store B total ${stamp}`], ["importId", byPos[3].id],
  ]);
  record(
    "a sub-question cannot be approved before its set's passage",
    early.body.includes("DI set passage first") && (await stagedRows()).find((r) => r.position === 3).status === "pending_review",
  );
  record("the review screen offers no editor for it yet", !approveForm(review.body, byPos[3].id));

  review = await get(reviewPath, "admin");
  await postForm(reviewPath, "admin", approveForm(review.body, byPos[2].id), [
    ["sectionId", dilrId], ["topic", "Tables"], ["difficulty", "medium"], ["body", `Sales table ${stamp}`],
  ]);
  const setRow = (await stagedRows()).find((row) => row.position === 2);
  record("the set's passage is approved as a DI stimulus", setRow.status === "approved" && setRow.question_id !== null);

  review = await get(reviewPath, "admin");
  const childForm = approveForm(review.body, byPos[3].id);
  record("once it is, its sub-question opens for approval", Boolean(childForm));
  await postForm(reviewPath, "admin", childForm, [
    ["sectionId", qaId], ["topic", "Tables"], ["difficulty", "medium"], ["marks", "3"],
    ["body", `Store B total ${stamp}`], ["accepted", "148"],
  ]);
  const childRow = (await stagedRows()).find((row) => row.position === 3);
  const { data: child } = await service.from("questions").select("parent_id, section_id").eq("id", childRow.question_id ?? -1);
  record(
    "the sub-question joins the set, in the set's section even when the post names another",
    child?.[0]?.parent_id === setRow.question_id && child?.[0]?.section_id === dilrId,
    JSON.stringify(child?.[0]),
  );

  // --------------------------------------------------- E. rejecting, discarding
  const rejected = await postForm(reviewPath, "admin", rejectForm(review.body, byPos[5].id), []);
  const rejectedAgain = await postForm(reviewPath, "admin", rejectForm(review.body, byPos[5].id), []);
  record(
    "rejecting marks the row rejected, and a second reject is refused",
    (await stagedRows()).find((r) => r.position === 5).status === "rejected" &&
      (rejected.location ?? "").includes("notice=rejected") &&
      (rejectedAgain.location ?? "").includes("notice=failed"),
  );

  const discardForm = forms(review.body).find((form) => form.includes("Discard what is not approved"));
  const before = await questionCount();
  await postForm(reviewPath, "admin", discardForm, []);
  const remaining = await stagedRows();
  record(
    "discarding removes the undecided and rejected rows and keeps every approved one",
    remaining.length === 4 && remaining.every((row) => row.status === "approved") && (await questionCount()) === before,
    `${remaining.length} rows left`,
  );

  const list = await get("/admin/questions?section=" + qaId, "admin");
  record("approved questions appear in the bank", list.body.includes(`Profit question ${stamp}`) && list.body.includes(`Half question ${stamp}`));
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
  for (const person of Object.values(people)) {
    const { error } = await service.auth.admin.deleteUser(person.id);
    if (error) console.log(`  cleanup could not remove ${person.id}: ${error.message}`);
  }

  const counts = {};
  for (const table of ["questions", "question_keys", "question_sections", "question_imports", "profiles", "courses", "documents"]) {
    const { count } = await service.from(table).select("*", { count: "exact", head: true });
    counts[table] = count;
  }
  console.log("\nlive counts after cleanup:", JSON.stringify(counts));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed} of ${results.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
