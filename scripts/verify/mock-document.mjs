// Mocks built from a document that quotes question IDs, driven over HTTP.
//
// node --env-file=.env.local scripts/verify/mock-document.mjs <baseUrl>
//
// Proves the sentence the feature exists for: an admin copies question IDs out
// of the bank, writes the mock as a plain-text document, pastes it in, and the
// mock is built with nothing picked by hand -- through the existing `save_mock`,
// so there is no new write path and no migration.
//
// **Every refusal is proven by counting rows**, never by the absence of an
// error. A refused paste must leave the mock count where it was, and that is
// what each check reads.
//
// Cleanup removes only this run's mocks, questions, sections, staged import rows
// and accounts, and prints the live counts afterwards.

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? "http://127.0.0.1:3020";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUB || !SECRET) throw new Error("missing Supabase env");

const service = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });

const ORG = 1;
// The isolated audit organisation, which no application route can remove. The
// other harnesses here use it as the rival org for the same reason.
const RIVAL_ORG = 5;
const stamp = Date.now();
const PASSWORD = `MockDocVerify${stamp}x`;
const people = {};
const made = { batches: [], mocks: [], questions: [], sections: [] };

const results = [];
function record(name, pass, detail) {
  results.push({ detail, name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}

function qid(id) {
  return `Q${String(id).padStart(5, "0")}`;
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

async function createPerson(key, role, orgId = ORG) {
  const email = `mockdoc-${key}-${stamp}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, password: PASSWORD });
  if (error) throw new Error(`create ${email}: ${error.message}`);
  const { error: pe } = await service
    .from("profiles")
    .insert({ email, id: data.user.id, name: `MockDoc ${key}`, org_id: orgId, role });
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

// An overridden name replaces every hidden copy of itself rather than being
// appended to them: the build form carries the pasted document as a hidden
// field, and appending a second copy would let the honest one do the work while
// a crafted post appeared to pass.
async function postForm(path, who, formHtml, fields) {
  const body = new FormData();
  const overridden = new Set(fields.map(([name]) => name));
  for (const [k, v] of hiddenFields(formHtml)) if (!overridden.has(k)) body.append(k, v);
  for (const [k, v] of fields) body.append(k, String(v));
  const res = await fetch(`${BASE}${path}`, {
    body,
    // Next.js refuses a Server Action with no Origin header, answering 500 with
    // a message about an older deployment. A browser always sends it.
    headers: { cookie: people[who].cookie, origin: BASE },
    method: "POST",
    redirect: "manual",
  });
  return { body: await res.text(), location: res.headers.get("location"), status: res.status };
}

async function saveQuestion(who, input) {
  const { data, error } = await people[who].client.rpc("save_question", input);
  if (error) throw new Error(`save_question: ${error.message}`);
  made.questions.push(data);
  return data;
}

// Every mock this organisation holds whose title this run wrote. Counting these
// is how a refusal is proven: the count must not move.
async function mockRows() {
  const { data } = await service.from("mocks").select("id,title,duration_minutes,negative_marking,negative_marking_types,max_attempts,allow_mobile,proctoring_enabled").like("title", `%${stamp}%`);
  for (const row of data ?? []) if (!made.mocks.includes(row.id)) made.mocks.push(row.id);
  return data ?? [];
}

async function mockCount() {
  return (await mockRows()).length;
}

const PREVIEW = "/admin/mocks/import";

async function previewForm(who = "admin") {
  const page = await get(PREVIEW, who);
  // The paste form, not the build form: both carry a field called `pasted`, and
  // both carry the hidden `$ACTION_*` fields a useActionState form is made of.
  const form = forms(page.body).find((f) => f.includes('<textarea') && f.includes('name="pasted"'));
  if (!form) throw new Error("no paste form on the import screen");
  return { form, page };
}

try {
  await createPerson("admin", "admin");
  await createPerson("mentor", "mentor");
  await createPerson("student", "student");
  await createPerson("rival", "admin", RIVAL_ORG);

  async function addSection(key, orgId) {
    const { data, error } = await service
      .from("question_sections")
      .insert({ name: `MockDoc ${key} ${stamp}`, org_id: orgId })
      .select("id")
      .single();
    if (error) throw new Error(`section ${key}: ${error.message}`);
    made.sections.push(data.id);
    return data.id;
  }
  const ownSection = await addSection("own", ORG);
  const rivalSection = await addSection("rival", RIVAL_ORG);

  const mcq = await saveQuestion("admin", {
    p_body: `Profit question ${stamp}`, p_correct_answer: { options: ["a"] }, p_difficulty: "easy",
    p_images: [], p_marks: 3, p_options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], p_parent_id: null,
    p_question_id: null, p_section_id: ownSection, p_solution: null, p_topic: "Profit", p_type: "mcq",
  });
  const tita = await saveQuestion("admin", {
    p_body: `Half question ${stamp}`, p_correct_answer: { accepted: ["0.5"], tolerance: 0 }, p_difficulty: "easy",
    p_images: [], p_marks: 3, p_options: [], p_parent_id: null, p_question_id: null,
    p_section_id: ownSection, p_solution: null, p_topic: "Fractions", p_type: "numerical",
  });
  const archived = await saveQuestion("admin", {
    p_body: `Archived question ${stamp}`, p_correct_answer: { options: ["a"] }, p_difficulty: "hard",
    p_images: [], p_marks: 3, p_options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], p_parent_id: null,
    p_question_id: null, p_section_id: ownSection, p_solution: null, p_topic: "Old", p_type: "mcq",
  });
  const stimulus = await saveQuestion("admin", {
    p_body: `DI passage ${stamp}`, p_correct_answer: null, p_difficulty: "medium", p_images: [], p_marks: 0,
    p_options: [], p_parent_id: null, p_question_id: null, p_section_id: ownSection, p_solution: null,
    p_topic: "Tables", p_type: "di_stimulus",
  });
  const childA = await saveQuestion("admin", {
    p_body: `DI child A ${stamp}`, p_correct_answer: { accepted: ["1"], tolerance: 0 }, p_difficulty: "medium",
    p_images: [], p_marks: 3, p_options: [], p_parent_id: stimulus, p_question_id: null,
    p_section_id: ownSection, p_solution: null, p_topic: "Tables", p_type: "numerical",
  });
  const childB = await saveQuestion("admin", {
    p_body: `DI child B ${stamp}`, p_correct_answer: { accepted: ["2"], tolerance: 0 }, p_difficulty: "medium",
    p_images: [], p_marks: 3, p_options: [], p_parent_id: stimulus, p_question_id: null,
    p_section_id: ownSection, p_solution: null, p_topic: "Tables", p_type: "numerical",
  });
  const childless = await saveQuestion("admin", {
    p_body: `Childless set ${stamp}`, p_correct_answer: null, p_difficulty: "medium", p_images: [], p_marks: 0,
    p_options: [], p_parent_id: null, p_question_id: null, p_section_id: ownSection, p_solution: null,
    p_topic: "Tables", p_type: "di_stimulus",
  });
  const rivalQuestion = await saveQuestion("rival", {
    p_body: `Rival question ${stamp}`, p_correct_answer: { options: ["a"] }, p_difficulty: "easy",
    p_images: [], p_marks: 3, p_options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], p_parent_id: null,
    p_question_id: null, p_section_id: rivalSection, p_solution: null, p_topic: "Rival", p_type: "mcq",
  });
  const missingId = 900_000_000 + (stamp % 1_000_000);

  // ------------------------------------------------------------- A. who gets in
  const anon = await get(PREVIEW);
  const studentPage = await get(PREVIEW, "student");
  const mentorPage = await get(PREVIEW, "mentor");
  record(
    "anonymous, students and mentors are turned away from the mock importer",
    anon.status === 307 && studentPage.status === 307 && mentorPage.status === 307,
    `${anon.status}/${studentPage.status}/${mentorPage.status}`,
  );

  const { form, page } = await previewForm();
  record(
    "the importer loads for an admin, showing the template to copy",
    page.status === 200 && page.body.includes("Mock: CAT Full Length 3") && page.body.includes("Section: VARC | 40"),
    String(page.status),
  );

  // ----------------------------------------------- B. reading a paste is inert
  const good = [
    `Mock: Verify sectional ${stamp}`,
    "Duration: 90",
    "Negative marking: 1 on mcq, mcq_multi",
    "Attempts: 2",
    "Allow mobile: no",
    "Proctoring: yes",
    "",
    "Section: QA | 50",
    `${qid(mcq)}, ${qid(tita)}`,
    "Section: DILR | 40",
    // The lenient spellings, on purpose: a document is typed by a person.
    `q${stimulus}`,
  ].join("\n");

  const before = await mockCount();
  const previewed = await postForm(PREVIEW, "admin", form, [["pasted", good]]);
  record(
    "a valid document previews its sections, its settings and the DI set it names",
    previewed.status === 200 &&
      previewed.body.includes("Build this mock") &&
      previewed.body.includes(qid(mcq)) &&
      previewed.body.includes(qid(stimulus)) &&
      previewed.body.includes("2 sub-questions come with it") &&
      previewed.body.includes("sectional timers"),
  );
  record("reading a paste creates no mock", (await mockCount()) === before);

  const buildForm = forms(previewed.body).find((f) => f.includes("Build this mock"));
  if (!buildForm) throw new Error("no build form in the preview");

  // -------------------------------------- C. refusals, each proven by counting
  async function refused(name, document, expect) {
    const was = await mockCount();
    const answer = await postForm(PREVIEW, "admin", form, [["pasted", document]]);
    const said = expect.every((fragment) => answer.body.includes(fragment));
    const now = await mockCount();
    record(name, said && now === was, `${now - was} mocks created; ${said ? "message shown" : `message missing: ${expect.join(" | ")}`}`);
  }

  const header = (title) => [`Mock: ${title} ${stamp}`, "Duration: 60", "", "Section: QA"].join("\n");

  await refused(
    "an ID that names no question is refused, with its line, and nothing is created",
    `${header("Missing")}\n${qid(mcq)}, ${qid(missingId)}`,
    [`Line 5: ${qid(missingId)} is not a question in this bank.`],
  );

  // Archived through the admin's own session, as the screen does. The service
  // key cannot write `questions`: the row's CHECK calls
  // private.question_images_valid, which is granted to `authenticated` only, and
  // a service-key update therefore changes nothing and reports nothing.
  {
    const { data: rows, error } = await people.admin.client
      .from("questions")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", archived)
      .select("id");
    if (error || rows?.length !== 1) throw new Error(`could not archive: ${error?.message ?? "0 rows"}`);
  }
  await refused(
    "an archived ID is refused and nothing is created",
    `${header("Archived")}\n${qid(archived)}`,
    [`Line 5: ${qid(archived)} is archived`],
  );

  await refused(
    "a DI child's own ID is refused, naming the set's ID instead",
    `${header("Child")}\n${qid(childA)}`,
    [`Line 5: ${qid(childA)} is one question inside a DI set. Use the set's own ID, ${qid(stimulus)}`],
  );

  await refused(
    "the same question twice is refused, naming both lines",
    `${header("Twice")}\n${qid(mcq)}\n${qid(mcq)}`,
    [`Line 6: ${qid(mcq)} is already in this mock, on line 5.`],
  );

  await refused(
    "a DI set with no sub-questions is refused",
    `${header("Childless")}\n${qid(childless)}`,
    [`Line 5: ${qid(childless)} is a DI set with no sub-questions yet`],
  );

  await refused(
    "another organisation's question ID reads as not in this bank",
    `${header("Rival")}\n${qid(rivalQuestion)}`,
    [`Line 5: ${qid(rivalQuestion)} is not a question in this bank.`],
  );

  await refused(
    "section minutes that do not add up to the duration are refused",
    `Mock: Totals ${stamp}\nDuration: 90\n\nSection: QA | 40\n${qid(mcq)}\nSection: DILR | 40\n${qid(tita)}`,
    ["The section minutes add up to 80, not the 90 on the Duration line."],
  );

  await refused(
    "a setting outside the builder's own limits is refused",
    `Mock: Attempts ${stamp}\nDuration: 60\nAttempts: 0\n\nSection: QA\n${qid(mcq)}`,
    ["is not an attempt limit"],
  );

  await refused(
    "a bare number is not read as a question ID",
    `${header("Bare")}\n${mcq}`,
    ["is not a question ID"],
  );

  await refused(
    "a setting the template does not know is refused rather than ignored",
    `Mock: Unknown ${stamp}\nDuration: 60\nShuffle: yes\n\nSection: QA\n${qid(mcq)}`,
    ["is not a setting this template understands"],
  );

  // A mentor posting the build action. The count is the proof: requireRole
  // answers with a redirect, which on its own says nothing about what was
  // written.
  const beforeMentor = await mockCount();
  const mentorBuild = await postForm(PREVIEW, "mentor", buildForm, []);
  record("a mentor posting the build action creates no mock", (await mockCount()) === beforeMentor, `${mentorBuild.status}`);

  // ---------------------------------------------------------- D. it builds one
  const built = await postForm(PREVIEW, "admin", buildForm, []);
  const builtId = Number((built.location ?? "").match(/\/admin\/mocks\/(\d+)/)?.[1]);
  if (Number.isInteger(builtId)) made.mocks.push(builtId);
  record(
    "confirming builds the mock and lands on it in the ordinary editor",
    built.status === 303 && Number.isInteger(builtId) && (built.location ?? "").endsWith("?notice=saved"),
    built.location ?? String(built.status),
  );

  const [row] = (await mockRows()).filter((m) => m.id === builtId);
  record(
    "every setting the document stated is stored",
    row?.duration_minutes === 90 &&
      Number(row?.negative_marking) === 1 &&
      Array.isArray(row?.negative_marking_types) &&
      row.negative_marking_types.join(",") === "mcq,mcq_multi" &&
      row?.max_attempts === 2 &&
      row?.allow_mobile === false &&
      row?.proctoring_enabled === true,
    JSON.stringify(row ?? null),
  );

  const { data: sections } = await service.from("mock_sections").select("id,title,duration_minutes,sort_order").eq("mock_id", builtId).order("sort_order");
  record(
    "the sections are built in document order with their own minutes",
    sections?.length === 2 &&
      sections[0].title === "QA" && sections[0].duration_minutes === 50 &&
      sections[1].title === "DILR" && sections[1].duration_minutes === 40,
    JSON.stringify(sections ?? null),
  );

  const { data: links } = await service.from("mock_questions").select("question_id,mock_section_id,sort_order").eq("mock_id", builtId).order("sort_order");
  const qaId = sections?.[0].id;
  const dilrId = sections?.[1].id;
  record(
    "the questions land in the sections the document named, in its order",
    links?.length === 5 &&
      links.filter((l) => l.mock_section_id === qaId).map((l) => l.question_id).join(",") === `${mcq},${tita}` &&
      links.filter((l) => l.mock_section_id === dilrId).map((l) => l.question_id).join(",") === `${stimulus},${childA},${childB}`,
    JSON.stringify(links ?? null),
  );
  record(
    "a DI set's own ID brought its passage and both sub-questions into one section",
    links?.filter((l) => l.mock_section_id === dilrId).length === 3,
  );

  const opened = await get(`/admin/mocks/${builtId}`, "admin");
  record(
    "the built mock opens in the ordinary mock editor",
    opened.status === 200 && opened.body.includes(`Verify sectional ${stamp}`) && opened.body.includes("Sectional timers"),
    String(opened.status),
  );

  // Overall timing: one section, no minutes, and the lenient ID spellings.
  const overall = [
    `Mock: Verify overall ${stamp}`,
    "Duration: 20",
    "Negative marking: none",
    "",
    "Section: All questions",
    `Q-${String(mcq).padStart(5, "0")} q${String(tita).padStart(5, "0")}`,
  ].join("\n");
  const overallPreview = await postForm(PREVIEW, "admin", form, [["pasted", overall]]);
  const overallForm = forms(overallPreview.body).find((f) => f.includes("Build this mock"));
  if (!overallForm) throw new Error("no build form for the overall-timed document");
  const overallBuilt = await postForm(PREVIEW, "admin", overallForm, []);
  const overallId = Number((overallBuilt.location ?? "").match(/\/admin\/mocks\/(\d+)/)?.[1]);
  if (Number.isInteger(overallId)) made.mocks.push(overallId);
  const { data: overallSections } = await service.from("mock_sections").select("title,duration_minutes").eq("mock_id", overallId);
  const { data: overallLinks } = await service.from("mock_questions").select("question_id").eq("mock_id", overallId).order("sort_order");
  record(
    "one section with no minutes stores one implicit untimed section",
    overallSections?.length === 1 && overallSections[0].duration_minutes === null,
    JSON.stringify(overallSections ?? null),
  );
  record(
    "Q-00042 and q00042 resolve to the same questions as Q00042 does",
    overallLinks?.map((l) => l.question_id).join(",") === `${mcq},${tita}`,
    JSON.stringify(overallLinks ?? null),
  );
  const { data: overallRow } = await service.from("mocks").select("negative_marking,negative_marking_types").eq("id", overallId).single();
  record(
    "“Negative marking: none” stores no penalty and no types",
    Number(overallRow?.negative_marking) === 0 && (overallRow?.negative_marking_types ?? []).length === 0,
    JSON.stringify(overallRow ?? null),
  );

  const { data: studentMocks } = await people.student.client.from("mocks").select("id").eq("id", builtId);
  record("a student reads zero rows of the mock this run built", (studentMocks ?? []).length === 0);

  // ------------------------------------------------- E. getting the IDs out
  const bank = await get(`/admin/questions?q=${encodeURIComponent(`question ${stamp}`)}`, "admin");
  record(
    "the bank shows each question's readable ID and offers the filtered list to copy",
    bank.status === 200 && bank.body.includes(qid(mcq)) && bank.body.includes(qid(tita)) && bank.body.includes("Question IDs for this list"),
    String(bank.status),
  );

  const byId = await get(`/admin/questions?q=${qid(tita)}`, "admin");
  record(
    "bank search by question ID finds that question and only it",
    byId.status === 200 && byId.body.includes(`Half question ${stamp}`) && !byId.body.includes(`Profit question ${stamp}`),
    String(byId.status),
  );

  const questionPage = await get(`/admin/questions/${mcq}`, "admin");
  record("the question page shows its own ID", questionPage.status === 200 && questionPage.body.includes(qid(mcq)));

  // The end of an import lists the IDs it created.
  //
  // The batch is seeded through the admin's **own session**, in two steps,
  // because `private.guard_question_import_write()` forces every inserted row to
  // `pending_review` with no question and no reviewer: an import row can only
  // become approved by being decided, which is exactly the rule Annexure A wants
  // and which a service-key insert cannot step round. (It was tried: the row
  // landed as `pending_review` and the screen honestly showed 0 approved.) What
  // is checked here is the screen the admin reads, over HTTP.
  const batchId = crypto.randomUUID();
  made.batches.push(batchId);
  const { error: batchError } = await people.admin.client.from("question_imports").insert([
    { batch_id: batchId, org_id: ORG, position: 0, raw: {}, source_ref: `MockDoc import ${stamp}`, source_type: "paste" },
    { batch_id: batchId, org_id: ORG, position: 1, raw: {}, source_ref: `MockDoc import ${stamp}`, source_type: "paste" },
  ]);
  if (batchError) throw new Error(`seed import batch: ${batchError.message}`);
  for (const [position, questionId] of [[0, mcq], [1, tita]]) {
    const { data: decided, error: decideError } = await people.admin.client
      .from("question_imports")
      .update({ question_id: questionId, status: "approved" })
      .eq("batch_id", batchId)
      .eq("position", position)
      .select("id");
    if (decideError || decided?.length !== 1) throw new Error(`approve staged row ${position}: ${decideError?.message ?? "0 rows"}`);
  }
  const review = await get(`/admin/questions/import/${batchId}`, "admin");
  const idsPanel = review.body.includes("The question IDs this import created");
  const inPaperOrder = review.body.includes(`${qid(mcq)}, ${qid(tita)}`);
  record(
    "the end of an import lists the IDs it created, in the paper's order, ready to copy",
    review.status === 200 && idsPanel && inPaperOrder,
    `${review.status}, panel ${idsPanel}, order ${inPaperOrder}`,
  );

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed} of ${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
} finally {
  if (made.mocks.length) await service.from("mocks").delete().in("id", made.mocks);
  if (made.batches.length) await service.from("question_imports").delete().in("batch_id", made.batches);
  if (made.questions.length) {
    await service.from("question_keys").delete().in("question_id", made.questions);
    // Children first: `questions.parent_id` restricts the delete of a set.
    await service.from("questions").delete().in("id", made.questions).not("parent_id", "is", null);
    await service.from("questions").delete().in("id", made.questions);
  }
  if (made.sections.length) await service.from("question_sections").delete().in("id", made.sections);
  for (const person of Object.values(people)) {
    await service.from("profiles").delete().eq("id", person.id);
    await service.auth.admin.deleteUser(person.id);
  }
  const counts = {};
  for (const table of ["mocks", "mock_sections", "mock_questions", "questions", "question_keys", "question_sections", "question_imports", "profiles", "courses", "documents"]) {
    const { count } = await service.from(table).select("*", { count: "exact", head: true });
    counts[table] = count;
  }
  console.log(`live counts after cleanup: ${JSON.stringify(counts)}`);
}
