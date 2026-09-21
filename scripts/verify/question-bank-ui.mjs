// The question bank's authoring screens, driven over HTTP.
//
// Proves Phase 3 PR 2 against a running application and the hosted database:
// admins and mentors write every question type through the real forms, posted
// with no JavaScript; students and another organisation's admin reach none of
// it -- not the pages, not the rows, not the answer keys, not the images; and
// the question-images bucket's Storage policies, which no SQL probe can reach,
// hold for upload, read and delete.
//
// node --env-file=.env.local scripts/verify/question-bank-ui.mjs <baseUrl>
//
// Cleanup removes only what this run created -- its questions, its sections,
// its image objects and its accounts -- and prints the live counts afterwards.

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? "http://127.0.0.1:3001";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

if (!URL_ || !PUB || !SECRET) throw new Error("missing supabase env");

const service = createClient(URL_, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}

const COSPIRE_ORG = 1;
const RIVAL_ORG = 5;
const BUCKET = "question-images";
const stamp = Date.now();
const PASSWORD = `QbankVerify${stamp}x`;
const SECTION = `Verify QA ${stamp}`;
const SECTION_2 = `Verify LR ${stamp}`;
const SECRET_SOLUTION = `SOLUTION-${stamp}`;

// A 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const people = {};
const createdSections = [];
const createdObjects = [];

async function signIn(email) {
  const jar = [];
  const ssr = createServerClient(URL_, PUB, {
    cookies: { getAll: () => [], setAll: (list) => jar.push(...list) },
  });
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

async function createPerson(key, role, orgId = COSPIRE_ORG) {
  const email = `qbank-${key}-${stamp}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, password: PASSWORD });
  if (error) throw new Error(`create ${email}: ${error.message}`);
  const { error: pe } = await service
    .from("profiles")
    .insert({ email, id: data.user.id, name: `Qbank ${key}`, org_id: orgId, role });
  if (pe) throw new Error(`profile ${email}: ${pe.message}`);
  people[key] = { id: data.user.id, ...(await signIn(email)) };
}

async function get(path, who) {
  const res = await fetch(`${BASE}${path}`, {
    headers: who ? { cookie: people[who].cookie } : {},
    redirect: "manual",
  });
  return { body: await res.text(), location: res.headers.get("location"), status: res.status };
}

function formWith(html, fieldName) {
  for (const form of html.matchAll(/<form[\s\S]*?<\/form>/g)) {
    if (form[0].includes(`name="${fieldName}"`)) return form[0];
  }
  return null;
}

function decodeEntities(raw) {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Every hidden input the server rendered into the form, including the
// `$ACTION_*` fields a `useActionState` form carries. Replaying those, rather
// than recognising one shape, is the honest test of the no-JavaScript path.
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

// `fields` is a list of pairs so repeated names -- "correct", "images" -- post
// as a browser posts them. A pair whose name is already hidden replaces it.
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

async function questionsByBody(body) {
  const { data } = await service
    .from("questions")
    .select("id, parent_id, type, body, section_id, topic, created_by, archived_at")
    .eq("body", body);
  return data ?? [];
}

async function keyFor(questionId) {
  const { data } = await service.from("question_keys").select("correct_answer, solution").eq("question_id", questionId);
  return (data ?? [])[0] ?? null;
}

function imagePath(orgId) {
  return `org/${orgId}/questions/${crypto.randomUUID()}.png`;
}

async function upload(who, path) {
  const { error } = await people[who].client.storage.from(BUCKET).upload(path, PNG, { contentType: "image/png" });
  if (!error) createdObjects.push(path);
  return error;
}

try {
  await createPerson("admin", "admin");
  await createPerson("mentor", "mentor");
  await createPerson("student", "student");
  await createPerson("rival", "admin", RIVAL_ORG);

  // ------------------------------------------------------------ A. who gets in
  const anon = await get("/admin/questions");
  record("an anonymous caller is sent to sign in", anon.status === 307 && anon.location?.includes("/login"), `${anon.status} -> ${anon.location}`);

  const studentAdmin = await get("/admin/questions", "student");
  const studentMentor = await get("/mentor/questions", "student");
  record(
    "a student is turned away from both copies of the bank",
    studentAdmin.status === 307 && studentMentor.status === 307,
    `${studentAdmin.status} -> ${studentAdmin.location}; ${studentMentor.status} -> ${studentMentor.location}`,
  );

  const mentorAdmin = await get("/admin/questions", "mentor");
  const mentorOwn = await get("/mentor/questions", "mentor");
  record(
    "a mentor has their own copy of the bank and not the admin's",
    mentorAdmin.status === 307 && mentorOwn.status === 200 && mentorOwn.body.includes("Question bank"),
    `${mentorAdmin.status}; ${mentorOwn.status}`,
  );

  const mentorSections = await get("/admin/questions/sections", "mentor");
  record("the sections screen is admin-only", mentorSections.status === 307, `${mentorSections.status}`);

  // --------------------------------------------------------------- B. sections
  const sectionsPage = await get("/admin/questions/sections", "admin");
  const createSectionForm = formWith(sectionsPage.body, "name");
  record("the sections screen loads with an add form", sectionsPage.status === 200 && Boolean(createSectionForm));
  if (!createSectionForm) throw new Error("no section form");

  // The add form is the last one carrying `name`; the per-row forms come first.
  const addForm = [...sectionsPage.body.matchAll(/<form[\s\S]*?<\/form>/g)]
    .map((m) => m[0])
    .filter((f) => f.includes('name="name"') && !f.includes('name="sectionId"'))
    .pop();

  const madeSection = await postForm("/admin/questions/sections", "admin", addForm, [["name", SECTION], ["sortOrder", "1"]]);
  await postForm("/admin/questions/sections", "admin", addForm, [["name", SECTION_2], ["sortOrder", "2"]]);
  const { data: sections } = await service.from("question_sections").select("id, name").in("name", [SECTION, SECTION_2]);
  for (const section of sections ?? []) createdSections.push(section.id);
  const sectionId = (sections ?? []).find((s) => s.name === SECTION)?.id;
  const section2Id = (sections ?? []).find((s) => s.name === SECTION_2)?.id;
  record(
    "an admin adds two sections",
    (sections ?? []).length === 2 && (madeSection.location ?? "").includes("notice=created"),
    `${(sections ?? []).length} rows -> ${madeSection.location}`,
  );

  const duplicate = await postForm("/admin/questions/sections", "admin", addForm, [["name", SECTION.toLowerCase()]]);
  const { count: sameName } = await service
    .from("question_sections")
    .select("id", { count: "exact", head: true })
    .ilike("name", SECTION);
  record(
    "a section differing only in case is refused, and nothing is written",
    (duplicate.location ?? "").includes("error=duplicate") && sameName === 1,
    `${duplicate.location}; ${sameName} row`,
  );

  const mentorSection = await postForm("/admin/questions/sections", "mentor", addForm, [["name", `Mentor ${stamp}`]]);
  const { count: mentorMade } = await service
    .from("question_sections")
    .select("id", { count: "exact", head: true })
    .eq("name", `Mentor ${stamp}`);
  record("a mentor posting the add-section action writes nothing", mentorMade === 0, `${mentorSection.status}; ${mentorMade} rows`);

  // --------------------------------------------------- C. writing questions
  const newMcq = await get("/admin/questions/new?type=mcq", "admin");
  const mcqForm = formWith(newMcq.body, "topic");
  record("the new-question editor loads for an admin", newMcq.status === 200 && Boolean(mcqForm));
  if (!mcqForm) throw new Error("no editor form");

  const MCQ_BODY = `If x + 2 = 5, what is x? ${stamp}`;
  const missingTopic = await postForm("/admin/questions/new?type=mcq", "admin", mcqForm, [
    ["sectionId", sectionId], ["topic", "  "], ["difficulty", "easy"], ["marks", "3"], ["body", MCQ_BODY],
    ["option-0", "2"], ["option-1", "3"], ["correct", "1"],
  ]);
  record(
    "a question with no topic is refused with a sentence, the typing kept, and nothing written",
    missingTopic.status === 200 &&
      missingTopic.body.includes("Give the question a topic.") &&
      missingTopic.body.includes(MCQ_BODY) &&
      (await questionsByBody(MCQ_BODY)).length === 0,
  );

  const savedMcq = await postForm("/admin/questions/new?type=mcq", "admin", mcqForm, [
    ["sectionId", sectionId], ["topic", " linear   equations "], ["difficulty", "easy"], ["marks", "3"],
    ["body", MCQ_BODY], ["option-0", "2"], ["option-1", "3"], ["option-2", "4"], ["correct", "1"],
    ["solution", SECRET_SOLUTION],
  ]);
  const [mcq] = await questionsByBody(MCQ_BODY);
  const mcqKey = mcq ? await keyFor(mcq.id) : null;
  record(
    "an admin saves a single-correct MCQ; the key is stored apart and the author stamped",
    Boolean(mcq) &&
      mcq.topic === "linear equations" &&
      mcq.created_by === people.admin.id &&
      JSON.stringify(mcqKey?.correct_answer) === '{"options":["b"]}' &&
      (savedMcq.location ?? "").startsWith(`/admin/questions/${mcq.id}`),
    `-> ${savedMcq.location}; key ${JSON.stringify(mcqKey?.correct_answer)}`,
  );

  const editPage = await get(`/admin/questions/${mcq.id}`, "admin");
  const editForm = formWith(editPage.body, "topic");
  record(
    "the saved question opens for editing with its answer marked",
    editPage.status === 200 && Boolean(editForm) && editPage.body.includes(SECRET_SOLUTION),
  );
  const EDITED = `If x + 2 = 6, what is x? ${stamp}`;
  await postForm(`/admin/questions/${mcq.id}`, "admin", editForm, [
    ["sectionId", sectionId], ["topic", "Linear equations"], ["difficulty", "medium"], ["marks", "2.5"],
    ["body", EDITED], ["option-0", "2"], ["option-1", "3"], ["option-2", "4"], ["correct", "2"],
    ["solution", SECRET_SOLUTION],
  ]);
  const [edited] = await questionsByBody(EDITED);
  const editedKey = edited ? await keyFor(edited.id) : null;
  record(
    "editing changes the question and its key together, in place",
    edited?.id === mcq.id && JSON.stringify(editedKey?.correct_answer) === '{"options":["c"]}',
    `id ${edited?.id}; key ${JSON.stringify(editedKey?.correct_answer)}`,
  );

  // Topic snapping: the mentor's differently spelled topic joins the admin's.
  const newNumerical = await get("/mentor/questions/new?type=numerical", "mentor");
  const numericalForm = formWith(newNumerical.body, "accepted");
  const NUM_BODY = `What is 1 divided by 2? ${stamp}`;
  const savedNumerical = await postForm("/mentor/questions/new?type=numerical", "mentor", numericalForm, [
    ["sectionId", sectionId], ["topic", "LINEAR EQUATIONS"], ["difficulty", "easy"], ["marks", "3"],
    ["body", NUM_BODY], ["accepted", "0.5\n1/2"], ["tolerance", ""],
  ]);
  const [numerical] = await questionsByBody(NUM_BODY);
  const numericalKey = numerical ? await keyFor(numerical.id) : null;
  record(
    "a mentor saves a typed-answer question, lands in their own copy, and the topic snaps to the existing spelling",
    numerical?.created_by === people.mentor.id &&
      numerical.topic === "Linear equations" &&
      JSON.stringify(numericalKey?.correct_answer) === '{"accepted":["0.5","1/2"]}' &&
      (savedNumerical.location ?? "").startsWith(`/mentor/questions/${numerical.id}`),
    `topic ${numerical?.topic}; -> ${savedNumerical.location}`,
  );

  const badForm = await postForm("/mentor/questions/new?type=numerical", "mentor", numericalForm, [
    ["sectionId", sectionId], ["topic", "T"], ["difficulty", "easy"], ["marks", "3"],
    ["body", `Bad ${stamp}`], ["accepted", "half"],
  ]);
  record(
    "a typed answer the checker cannot compare is refused",
    badForm.body.includes("is not a number the answer box can compare") && (await questionsByBody(`Bad ${stamp}`)).length === 0,
  );

  // DI set: a passage, then a sub-question that inherits its section.
  const newSet = await get("/admin/questions/new?type=di_stimulus", "admin");
  const setForm = formWith(newSet.body, "topic");
  const SET_BODY = `Quarterly sales table ${stamp}`;
  await postForm("/admin/questions/new?type=di_stimulus", "admin", setForm, [
    ["sectionId", sectionId], ["topic", "Tables"], ["difficulty", "medium"], ["body", SET_BODY],
  ]);
  const [stimulus] = await questionsByBody(SET_BODY);
  record("an admin saves a DI set's passage", stimulus?.type === "di_stimulus", `id ${stimulus?.id}`);

  const newChild = await get(`/admin/questions/new?type=mcq&parent=${stimulus.id}`, "admin");
  const childForm = formWith(newChild.body, "topic");
  const CHILD_BODY = `Which quarter sold most? ${stamp}`;
  const savedChild = await postForm(`/admin/questions/new?type=mcq&parent=${stimulus.id}`, "admin", childForm, [
    ["topic", "Tables"], ["difficulty", "medium"], ["marks", "3"], ["body", CHILD_BODY],
    ["option-0", "Q1"], ["option-1", "Q2"], ["correct", "0"],
  ]);
  const [child] = await questionsByBody(CHILD_BODY);
  record(
    "a sub-question joins the set in the set's section, and the editor returns to the set",
    child?.parent_id === stimulus.id &&
      child.section_id === sectionId &&
      (savedChild.location ?? "").startsWith(`/admin/questions/${stimulus.id}`),
    `parent ${child?.parent_id}; -> ${savedChild.location}`,
  );

  const setPage = await get(`/admin/questions/${stimulus.id}`, "admin");
  record("the set's page lists its sub-question", setPage.body.includes(CHILD_BODY));

  const CROSS = `Cross-section child ${stamp}`;
  const crossSection = await postForm(`/admin/questions/new?type=mcq&parent=${stimulus.id}`, "admin", childForm, [
    ["sectionId", section2Id], ["topic", "Tables"], ["difficulty", "medium"], ["marks", "3"], ["body", CROSS],
    ["option-0", "a"], ["option-1", "b"], ["correct", "0"],
  ]);
  record(
    "a crafted post moving a sub-question out of its set's section is refused by the database",
    crossSection.body.includes("same section as its DI stimulus") && (await questionsByBody(CROSS)).length === 0,
  );

  // ----------------------------------------------- D. nothing reaches a student
  for (const path of [`/admin/questions/${mcq.id}`, `/mentor/questions/${mcq.id}`]) {
    const page = await get(path, "student");
    record(
      `a student opening ${path.split("/")[1]}'s copy of the question is turned away with none of it`,
      page.status === 307 && !page.body.includes(EDITED) && !page.body.includes(SECRET_SOLUTION),
      `${page.status} -> ${page.location}`,
    );
  }

  const studentPost = await postForm("/admin/questions/new?type=mcq", "student", mcqForm, [
    ["sectionId", sectionId], ["topic", "T"], ["difficulty", "easy"], ["marks", "1"], ["body", `Student ${stamp}`],
    ["option-0", "a"], ["option-1", "b"], ["correct", "0"],
  ]);
  record(
    "a student posting the save action directly writes nothing",
    (await questionsByBody(`Student ${stamp}`)).length === 0,
    `${studentPost.status} -> ${studentPost.location}`,
  );

  const studentRows = await people.student.client.from("questions").select("id").eq("id", mcq.id);
  const studentKeys = await people.student.client.from("question_keys").select("question_id").eq("question_id", mcq.id);
  record(
    "a student querying the API directly reads 0 questions and 0 answer keys",
    (studentRows.data ?? []).length === 0 && (studentKeys.data ?? []).length === 0,
    `${(studentRows.data ?? []).length} / ${(studentKeys.data ?? []).length}`,
  );

  const rivalList = await get("/admin/questions", "rival");
  const rivalOpen = await get(`/admin/questions/${mcq.id}`, "rival");
  const rivalKeys = await people.rival.client.from("question_keys").select("question_id").eq("question_id", mcq.id);
  record(
    "another organisation's admin sees none of it: not in the list, not by id, not the key",
    !rivalList.body.includes(EDITED) &&
      !rivalOpen.body.includes(EDITED) &&
      !rivalOpen.body.includes(SECRET_SOLUTION) &&
      (rivalKeys.data ?? []).length === 0,
    `list ${rivalList.status}; open ${rivalOpen.status}`,
  );

  // ------------------------------------------------------------ E. archiving
  const archiveForm = formWith(setPage.body, "archive");
  await postForm(`/admin/questions/${stimulus.id}`, "admin", archiveForm, []);
  const [archivedSet] = await questionsByBody(SET_BODY);
  const [archivedChild] = await questionsByBody(CHILD_BODY);
  const liveList = await get(`/admin/questions?section=${sectionId}`, "admin");
  const archivedList = await get(`/admin/questions?section=${sectionId}&status=archived`, "admin");
  record(
    "archiving a set archives its sub-questions and takes it out of the list",
    archivedSet?.archived_at !== null &&
      archivedChild?.archived_at !== null &&
      !liveList.body.includes(SET_BODY) &&
      archivedList.body.includes(SET_BODY),
  );

  const archivedPage = await get(`/admin/questions/${stimulus.id}`, "admin");
  await postForm(`/admin/questions/${stimulus.id}`, "admin", formWith(archivedPage.body, "archive"), []);
  const [restoredSet] = await questionsByBody(SET_BODY);
  const [restoredChild] = await questionsByBody(CHILD_BODY);
  record(
    "restoring brings the set and its sub-questions back",
    restoredSet?.archived_at === null && restoredChild?.archived_at === null,
  );

  // --------------------------------------------- F. the image bucket's policies
  const adminImage = imagePath(COSPIRE_ORG);
  const mentorImage = imagePath(COSPIRE_ORG);
  record("an admin uploads an image beneath their organisation", !(await upload("admin", adminImage)));
  record("a mentor uploads one too", !(await upload("mentor", mentorImage)));
  record("a student's upload is refused", Boolean(await upload("student", imagePath(COSPIRE_ORG))));
  record("another organisation's admin cannot upload into this one", Boolean(await upload("rival", imagePath(COSPIRE_ORG))));
  record("an admin cannot upload into another organisation", Boolean(await upload("admin", imagePath(RIVAL_ORG))));
  record(
    "a path not shaped like a question image is refused",
    Boolean(await upload("admin", `org/${COSPIRE_ORG}/questions/../evil.png`)) &&
      Boolean(await upload("admin", `org/${COSPIRE_ORG}/questions/not-a-uuid.png`)),
  );

  const mentorReads = await people.mentor.client.storage.from(BUCKET).download(adminImage);
  const studentReads = await people.student.client.storage.from(BUCKET).download(adminImage);
  const rivalReads = await people.rival.client.storage.from(BUCKET).download(adminImage);
  const anonReads = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${adminImage}`, { headers: { apikey: PUB } });
  record(
    "the image is read by a mentor and refused to a student, another org's admin and an anonymous caller",
    !mentorReads.error && Boolean(studentReads.error) && Boolean(rivalReads.error) && anonReads.status >= 400,
    `anon ${anonReads.status}`,
  );

  const withImage = await get(`/admin/questions/${mcq.id}`, "admin");
  await postForm(`/admin/questions/${mcq.id}`, "admin", formWith(withImage.body, "topic"), [
    ["sectionId", sectionId], ["topic", "Linear equations"], ["difficulty", "medium"], ["marks", "2.5"],
    ["body", EDITED], ["option-0", "2"], ["option-1", "3"], ["option-2", "4"], ["correct", "2"],
    ["images", adminImage],
  ]);
  const afterImage = await get(`/admin/questions/${mcq.id}`, "admin");
  const { data: imageRow } = await service.from("questions").select("images").eq("id", mcq.id).single();
  record(
    "an image saved on a question is stored and shown back through a short-lived signed URL",
    JSON.stringify(imageRow?.images) === JSON.stringify([adminImage]) &&
      afterImage.body.includes(`/object/sign/${BUCKET}/`),
  );

  const removed = await people.admin.client.storage.from(BUCKET).remove([mentorImage]);
  const gone = await service.storage.from(BUCKET).download(mentorImage);
  record(
    "an author can delete an image object (the delete policy, over HTTP)",
    !removed.error && (removed.data ?? []).length === 1 && Boolean(gone.error),
  );
  const studentRemove = await people.student.client.storage.from(BUCKET).remove([adminImage]);
  const stillThere = await service.storage.from(BUCKET).download(adminImage);
  record(
    "a student's delete removes nothing",
    (studentRemove.data ?? []).length === 0 && !stillThere.error,
  );
} catch (error) {
  record("run completed without throwing", false, String(error));
} finally {
  // Only this run's rows: sub-questions before their sets, then sections, then
  // images, then accounts. Keys go with their questions by cascade.
  if (createdSections.length > 0) {
    const { data: ours } = await service
      .from("questions")
      .select("id, parent_id")
      .in("section_id", createdSections);
    const children = (ours ?? []).filter((q) => q.parent_id !== null).map((q) => q.id);
    const parents = (ours ?? []).filter((q) => q.parent_id === null).map((q) => q.id);
    if (children.length) await service.from("questions").delete().in("id", children);
    if (parents.length) await service.from("questions").delete().in("id", parents);
    await service.from("question_sections").delete().in("id", createdSections);
  }
  if (createdObjects.length > 0) await service.storage.from(BUCKET).remove(createdObjects);
  for (const person of Object.values(people)) {
    const { error } = await service.auth.admin.deleteUser(person.id);
    if (error) console.log(`  cleanup could not remove ${person.id}: ${error.message}`);
  }

  const counts = {};
  for (const table of ["questions", "question_keys", "question_sections", "question_imports", "profiles", "courses", "documents"]) {
    const { count } = await service.from(table).select("*", { count: "exact", head: true });
    counts[table] = count;
  }
  const { data: objects } = await service.storage.from(BUCKET).list(`org/${COSPIRE_ORG}/questions`, { limit: 1000 });
  counts.question_image_objects = (objects ?? []).length;
  console.log("\nlive counts after cleanup:", JSON.stringify(counts));

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed} of ${results.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
