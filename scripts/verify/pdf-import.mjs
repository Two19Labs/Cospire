// The PDF upload, driven end to end.
//
// Proves the sentence the feature exists for: *an admin uploads a PDF, its
// pictures land in the question-images bucket as real PNGs, the text comes back
// with [[figure:N]] where each one sat, and after the model's JSON is pasted
// back the marker resolves to that picture on the approved question.*
//
//   node --env-file=.env.local scripts/verify/pdf-import.mjs <baseUrl> [paper.pdf]
//
// The same two halves as `docx-import.mjs`, and the same limit: extraction runs
// in the browser (`word-upload-field.tsx`), so this runs the *real* `readPdf`
// with PDF.js's Node build and uploads each picture under a real admin session,
// byte-identically to the browser; everything after that is driven over HTTP
// against `<baseUrl>`. The React click handler joining the two is not exercised.
//
// The paper is built here, so nothing confidential is needed to run it. Given a
// path to a real paper as well, it also reads that one and puts every picture it
// yields through the bucket, then removes them: proof that real pictures, not
// only a fixture, are accepted. The Client's papers never enter git.
//
// Cleanup removes only this run's objects, staged rows, questions, sections and
// accounts, and prints the live counts afterwards.

import fs from "node:fs";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

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

const { readPdf } = await import(featureUrl("pdf.ts"));
const { buildQuestionImagePath, questionImagesBucket } = await import(featureUrl("storage.ts"));

const BASE = process.argv[2] ?? "http://127.0.0.1:3030";
const REAL_PAPER = process.argv[3] ?? null;
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
const PASSWORD = `PdfVerify${stamp}x`;
const DOC = `Verify pdf ${stamp}`;
const QA = `QA ${stamp}`;
const people = {};
const sectionIds = [];
const createdObjects = [];

// ---------------------------------------------------------------------------
// A question paper, as a real PDF: a question, a 40x30 picture, its options,
// and a second question with no picture.
// ---------------------------------------------------------------------------

function buildPdf(content, image) {
  const objects = [];
  const add = (body) => objects.push(body);
  const stream = (dict, data) => `<< ${dict} /Length ${data.length} >>\nstream\n${data}\nendstream`;
  const catalog = add("");
  const pagesId = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const picture = add(
    stream(
      `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8`,
      image.data,
    ),
  );
  const contentId = add(stream("", content));
  const page = add(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R ` +
      `/Resources << /Font << /F1 ${font} 0 R >> /XObject << /Im1 ${picture} 0 R >> >> >>`,
  );
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(out, (char) => char.charCodeAt(0));
}

// A 40x30 gradient, so the PNG has real rows to encode.
const imageData = Array.from({ length: 40 * 30 }, (_, i) =>
  String.fromCharCode((i % 40) * 6, Math.floor(i / 40) * 8, 120),
).join("");
const line = (y, value) => `BT /F1 12 Tf 20 ${y} Td (${value}) Tj ET\n`;
const pdfFile = buildPdf(
  line(360, `Q1. Profit question ${stamp}. Study the figure.`) +
    "q 120 0 0 90 20 250 cm /Im1 Do Q\n" +
    line(225, "(a) 12.5% (b) 15% (c) 10% (d) 12%") +
    line(190, `Q2. Plain question ${stamp}.`),
  { data: imageData, height: 30, width: 40 },
);

// ---------------------------------------------------------------------------
// Plumbing, the same as docx-import.mjs
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
  const email = `pdfimport-${key}-${stamp}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, password: PASSWORD });
  if (error) throw new Error(`create ${email}: ${error.message}`);
  const { error: pe } = await service
    .from("profiles")
    .insert({ email, id: data.user.id, name: `Pdf ${key}`, org_id: orgId, role });
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


const isPng = (bytes) => bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;

try {
  await createPerson("admin", "admin");
  await createPerson("student", "student");
  const { data: section } = await service.from("question_sections").insert({ name: QA, org_id: ORG }).select("id").single();
  sectionIds.push(section.id);
  const qaId = section.id;

  // ------------------------------------------------ A. opening the PDF
  const paper = await readPdf(pdfFile, pdfjs);
  record(
    "the text comes back in reading order with the marker where the picture sat",
    paper.text ===
      `Q1. Profit question ${stamp}. Study the figure.\n[[figure:1]]\n(a) 12.5% (b) 15% (c) 10% (d) 12%\nQ2. Plain question ${stamp}.`,
    JSON.stringify(paper.text),
  );
  record(
    "the picture comes out as a real PNG",
    paper.figures.length === 1 && paper.figures[0].contentType === "image/png" && isPng(paper.figures[0].bytes),
    paper.figures.map((f) => `${f.n}:${f.contentType ?? f.note}:${f.bytes?.length ?? 0}`).join(" | "),
  );

  // ------------------------------------- B. the picture reaches the bucket
  const { error: uploadError, path } = await uploadFigure("admin", paper.figures[0]);
  if (uploadError) throw new Error(`upload: ${uploadError.message}`);
  createdObjects.push(path);
  const { data: stored } = await service.storage.from(questionImagesBucket).download(path);
  const storedBytes = stored ? new Uint8Array(await stored.arrayBuffer()) : new Uint8Array();
  record(
    "the admin's upload stores the PNG byte for byte under their organisation",
    path.startsWith(`org/${ORG}/questions/`) &&
      storedBytes.length === paper.figures[0].bytes.length &&
      storedBytes.every((byte, i) => byte === paper.figures[0].bytes[i]),
    `${storedBytes.length} bytes`,
  );
  const studentUpload = await uploadFigure("student", paper.figures[0]);
  if (!studentUpload.error) createdObjects.push(studentUpload.path);
  record("a student uploading the same picture is refused", Boolean(studentUpload.error), studentUpload.error?.message);

  if (REAL_PAPER) {
    const real = await readPdf(new Uint8Array(fs.readFileSync(REAL_PAPER)), pdfjs);
    const pictures = real.figures.filter((figure) => figure.bytes);
    let accepted = 0;
    const refused = [];
    for (const figure of pictures) {
      // Tried twice, as word-upload-field.tsx does.
      let upload = await uploadFigure("admin", figure);
      if (upload.error) upload = await uploadFigure("admin", figure);
      if (!upload.error) {
        accepted += 1;
        createdObjects.push(upload.path);
      } else refused.push(`figure ${figure.n} (${figure.bytes.length} bytes): ${upload.error.message}`);
    }
    record(
      "every picture taken out of the real paper is accepted by the bucket",
      pictures.length > 0 && accepted === pictures.length,
      `${accepted}/${pictures.length} of ${real.figures.length} figures${refused.length ? `; refused ${refused.join("; ")}` : ""}`,
    );
  }

  // --------------------------------- C. the screen, the paste and the map
  const page = await get("/admin/questions/import", "admin");
  record("the import screen's upload accepts a PDF", page.status === 200 && /accept="[^"]*\.pdf/.test(page.body), `${page.status}`);

  const pastePage = await get("/admin/questions/import?paste=1", "admin");
  const answer = {
    document: DOC,
    questions: [
      {
        answer: "B", difficulty: "medium", marks: 3, options: ["12.5%", "15%", "10%", "12%"],
        question: `Profit question ${stamp}. Study the figure.\n[[figure:1]]`,
        section: QA, source: `Q1 source ${stamp}`, topic: "Profit and loss", type: "mcq",
      },
      {
        answer: "A", difficulty: "easy", marks: 3, options: ["1", "2", "3", "4"],
        question: `Plain question ${stamp}.`,
        section: QA, source: `Q2 source ${stamp}`, topic: "Numbers", type: "mcq",
      },
    ],
  };
  const figureFields = [["figures", `1:${path}`]];
  const previewForm = forms(pastePage.body).find((form) => form.includes('name="pasted"'));
  if (!previewForm) throw new Error("no paste form");
  const previewed = await postForm("/admin/questions/import", "admin", previewForm, [
    ["pasted", JSON.stringify(answer)], ["documentName", DOC], ["defaultMarks", "3"], ...figureFields,
  ]);
  record(
    "reading the paste attaches the marker to its picture",
    previewed.status === 200 && previewed.body.includes("Send 2 for review") && /1 figure attached/.test(previewed.body),
    `${previewed.status}`,
  );
  const stageForm = forms(previewed.body).find((form) => form.includes("Send 2 for review"));
  if (!stageForm) throw new Error("no stage form");

  // ------------------------------------------------- D. staging and approval
  const staged = await postForm("/admin/questions/import", "admin", stageForm, figureFields);
  const rows = await stagedRows();
  const batchId = rows[0]?.batch_id;
  record(
    "staging writes one row per question and opens the review screen",
    rows.length === 2 && (staged.location ?? "") === `/admin/questions/import/${batchId}`,
    `${rows.length} rows -> ${staged.location}`,
  );
  record(
    "the marker resolved to the PDF's picture, and the plain question carries none",
    JSON.stringify(rows[0]?.parsed?.images) === JSON.stringify([path]) && (rows[1]?.parsed?.images ?? []).length === 0,
    `q1=${JSON.stringify(rows[0]?.parsed?.images)}`,
  );

  const reviewPath = `/admin/questions/import/${batchId}`;
  const review = await get(reviewPath, "admin");
  const q1Form = approveForm(review.body, rows[0].id);
  if (!q1Form) throw new Error("no approve form for question 1");
  const approved = await postForm(reviewPath, "admin", q1Form, [
    ["sectionId", qaId], ["topic", "Profit and loss"], ["difficulty", "medium"], ["marks", "3"],
    ["body", `Profit question ${stamp}`], ["option-0", "12.5%"], ["option-1", "15%"],
    ["option-2", "10%"], ["option-3", "12%"], ["correct", "1"],
  ]);
  const approvedRow = (await stagedRows()).find((row) => row.position === 0);
  const { data: saved } = await service
    .from("questions")
    .select("id, images")
    .eq("id", approvedRow?.question_id ?? -1)
    .maybeSingle();
  record(
    "the approved question carries the picture the PDF's figure 1 became",
    approvedRow?.status === "approved" && JSON.stringify(saved?.images) === JSON.stringify([path]),
    `${approved.status} -> ${JSON.stringify(saved?.images)}`,
  );

  const studentReads = await people.student.client.storage.from(questionImagesBucket).download(path);
  record("a student is refused the picture in the bucket", studentReads.data === null);
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
