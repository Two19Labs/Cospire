// Drives the running application over HTTP with real session cookies.
// node --env-file=.env.local coverage/verify/verify.mjs <state.json> <baseUrl>
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const STATE_PATH = process.argv[2];
const BASE = process.argv[3] ?? "http://127.0.0.1:3000";
const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(URL_, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}

async function get(path, who) {
  const res = await fetch(`${BASE}${path}`, {
    headers: who ? { cookie: state.people[who].cookie } : {},
    redirect: "manual",
  });
  return {
    status: res.status,
    location: res.headers.get("location"),
    body: await res.text(),
  };
}

async function callAction(path, who, actionId, args) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      cookie: state.people[who].cookie,
      "Next-Action": actionId,
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  return {
    status: res.status,
    location: res.headers.get("location") ?? res.headers.get("x-action-redirect"),
    body: await res.text(),
  };
}

// ---------------------------------------------------------------- A. guards
const guards = [
  ["anonymous cannot reach the admin library", "/admin/documents", null, "/login"],
  ["anonymous cannot reach a student document list", "/student/documents", null, "/login"],
  ["student cannot reach the admin library", "/admin/documents", "studentA", "/student"],
  ["mentor cannot reach the admin library", "/admin/documents", "mentor", "/mentor"],
  ["mentor cannot reach the student library", "/student/documents", "mentor", "/mentor"],
];

for (const [name, path, who, expect] of guards) {
  const res = await get(path, who);
  const redirected = res.status === 307 || res.status === 302 || res.status === 303;
  record(
    name,
    redirected && (res.location ?? "").includes(expect),
    `${res.status} -> ${res.location}`,
  );
}

const adminLibrary = await get("/admin/documents", "admin");
record("admin reaches the library", adminLibrary.status === 200, `${adminLibrary.status}`);

// ------------------------------------------------------------ B. the upload
const ACTION_A = process.env.ACTION_TICKET;
const ACTION_B = process.env.ACTION_RECORD;

const ticketResponse = await callAction("/admin/documents", "admin", ACTION_A, [
  { folder: "Verification", title: "Phase 1 verification document" },
]);

const tokenMatch = ticketResponse.body.match(/"token":"([^"]+)"/);
const pathMatch = ticketResponse.body.match(/"path":"(org\/[^"]+)"/);
record(
  "admin is issued an upload ticket",
  Boolean(tokenMatch && pathMatch),
  pathMatch ? pathMatch[1] : ticketResponse.body.slice(0, 200),
);

if (!tokenMatch || !pathMatch) {
  console.log("\ncannot continue without an upload ticket");
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  process.exit(1);
}

const objectPath = pathMatch[1];
const uploadToken = tokenMatch[1];

// A student asking for an upload ticket is refused.
const studentTicket = await callAction("/admin/documents", "studentA", ACTION_A, [
  { folder: "", title: "Student attempt" },
]);
record(
  "student is refused an upload ticket",
  !/"token":"/.test(studentTicket.body),
  `status ${studentTicket.status}`,
);

// The browser's step: bytes go straight to Storage, never through the app.
const pdf = readFileSync("coverage/verify/sample.pdf");
const anonClient = createClient(URL_, PUB, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error: uploadError } = await anonClient.storage
  .from("documents")
  .uploadToSignedUrl(objectPath, uploadToken, pdf, {
    contentType: "application/pdf",
  });
record("bytes upload directly to storage", !uploadError, uploadError?.message ?? `${pdf.length} bytes`);

const recordResponse = await callAction("/admin/documents", "admin", ACTION_B, [
  {
    folder: "Verification",
    path: objectPath,
    title: "Phase 1 verification document",
  },
]);

const { data: docRows } = await admin
  .from("documents")
  .select("id, org_id, title, folder, storage_path, uploaded_by")
  .eq("storage_path", objectPath);

const documentRow = (docRows ?? [])[0];
record(
  "the document row is written after the object lands",
  Boolean(documentRow) &&
    documentRow.title === "Phase 1 verification document" &&
    documentRow.folder === "Verification" &&
    documentRow.org_id === 1 &&
    documentRow.uploaded_by === state.people.admin.id,
  documentRow ? `id ${documentRow.id}` : `no row; action said ${recordResponse.status}`,
);

if (!documentRow) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  process.exit(1);
}

state.documentId = documentRow.id;
state.objectPath = objectPath;
writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

// -------------------------------------------------- C. the detail + granting
const detail = await get(`/admin/documents/${documentRow.id}`, "admin");
record("admin opens the document detail", detail.status === 200, `${detail.status}`);

// The grant form is a progressive-enhancement Server Action: read its id out of
// the rendered HTML rather than guessing, because ids change on recompile.
//
// Scoped to the form that actually carries `documentId`. The page holds several
// action forms -- Sign out is the first one in the header -- and taking the
// first id on the page posts grant fields at the logout action, which is a
// convincing false failure.
function grantFormActionId(html) {
  for (const form of html.matchAll(/<form[\s\S]*?<\/form>/g)) {
    if (!form[0].includes('name="documentId"')) continue;
    const id = form[0].match(/\$ACTION_ID_([a-f0-9]+)/);
    if (id) return id[1];
  }
  return null;
}

const grantActionId = grantFormActionId(detail.body);
const actionIdMatch = grantActionId ? [null, grantActionId] : null;
record(
  "the grant form renders without JavaScript",
  Boolean(actionIdMatch),
  actionIdMatch ? actionIdMatch[1].slice(0, 12) + "..." : "no action id in HTML",
);

async function postGrantForm(who, studentId, intent) {
  // multipart/form-data, matching the encType Next renders on the form. This is
  // the no-JavaScript path exactly as a browser with scripting disabled would
  // submit it.
  const form = new FormData();
  form.set("documentId", String(documentRow.id));
  form.set("studentId", studentId);
  form.set("intent", intent);
  form.set(`$ACTION_ID_${actionIdMatch[1]}`, "");

  const res = await fetch(`${BASE}/admin/documents/${documentRow.id}`, {
    method: "POST",
    headers: { cookie: state.people[who].cookie },
    body: form,
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location") };
}

async function grantCount(studentId) {
  const { count } = await admin
    .from("content_access")
    .select("id", { count: "exact", head: true })
    .eq("resource_type", "document")
    .eq("resource_id", documentRow.id)
    .eq("student_id", studentId);
  return count ?? 0;
}

if (actionIdMatch) {
  await postGrantForm("admin", state.people.studentA.id, "grant");
  record(
    "admin grants the document to student A",
    (await grantCount(state.people.studentA.id)) === 1,
    "content_access row present",
  );

  await postGrantForm("studentB", state.people.studentB.id, "grant");
  record(
    "student B cannot grant themselves access",
    (await grantCount(state.people.studentB.id)) === 0,
    "no content_access row written",
  );

  await postGrantForm("rivalAdmin", state.people.studentB.id, "grant");
  record(
    "an admin of another organisation cannot grant this document",
    (await grantCount(state.people.studentB.id)) === 0,
    "no content_access row written",
  );
}

// ------------------------------------------------------------ D. the gate
const listA = await get("/student/documents", "studentA");
record(
  "student A sees the document in their list",
  listA.status === 200 && listA.body.includes("Phase 1 verification document"),
  `${listA.status}`,
);

const listB = await get("/student/documents", "studentB");
record(
  "student B's list does not contain it",
  listB.status === 200 && !listB.body.includes("Phase 1 verification document"),
  `${listB.status}`,
);

const viewA = await get(`/student/documents/${documentRow.id}`, "studentA");
const watermarkPresent =
  viewA.body.includes(state.people.studentA.email) &&
  viewA.body.includes("Docs Verify Student A");
record("student A can open the document", viewA.status === 200, `${viewA.status}`);
record(
  "the watermark names student A, composed server-side",
  watermarkPresent,
  "name and address both present in the server-rendered HTML",
);

const viewB = await get(`/student/documents/${documentRow.id}`, "studentB");
record(
  "student B is refused the document",
  viewB.status === 404,
  `${viewB.status}`,
);

const viewMentor = await get(`/student/documents/${documentRow.id}`, "mentor");
record(
  "mentor is refused the document",
  viewMentor.status === 307 || viewMentor.status === 404,
  `${viewMentor.status}`,
);

const viewAnon = await get(`/student/documents/${documentRow.id}`, null);
record(
  "anonymous is refused the document",
  viewAnon.status === 307 && (viewAnon.location ?? "").includes("/login"),
  `${viewAnon.status}`,
);

// The signed URL is in the page student A was served. Pull it out and use it.
const signedMatch = viewA.body.match(
  /https:\\?\/\\?\/[^"\\ ]*\/storage\/v1\/object\/sign\/documents\/[^"\\ ]*/,
);
const signedUrl = signedMatch ? signedMatch[0].replace(/\\\//g, "/").replace(/&amp;/g, "&") : null;
record("a signed URL was minted for student A", Boolean(signedUrl), signedUrl ? "found in page" : "not found");

if (signedUrl) {
  const fetched = await fetch(signedUrl);
  const bytes = Buffer.from(await fetched.arrayBuffer());
  record(
    "the signed URL returns the real PDF bytes",
    fetched.ok &&
      bytes.subarray(0, 5).toString() === "%PDF-" &&
      bytes.length === pdf.length,
    `HTTP ${fetched.status}, ${bytes.length} bytes, header ${bytes.subarray(0, 5).toString()}`,
  );

  // Expiry window, read out of the token rather than assumed.
  const token = new URL(signedUrl).searchParams.get("token");
  let ttl = null;
  if (token) {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    ttl = payload.exp - payload.iat;
  }
  record(
    "the signed URL expires inside the contracted 5-15 minute window",
    ttl !== null && ttl >= 300 && ttl <= 900,
    `${ttl} seconds`,
  );

  const tampered = signedUrl.replace(/token=([^&]+)/, (m, t) => `token=${t.slice(0, -4)}AAAA`);
  const tamperedResponse = await fetch(tampered);
  record(
    "a tampered signed URL is refused",
    !tamperedResponse.ok,
    `HTTP ${tamperedResponse.status}`,
  );
}

// ------------------------------------- E. bypassing the app entirely
async function directObjectFetch(who) {
  const headers = { apikey: PUB };
  if (who) headers.authorization = `Bearer ${state.people[who].accessToken}`;
  const res = await fetch(
    `${URL_}/storage/v1/object/documents/${objectPath}`,
    { headers },
  );
  return res;
}

for (const [who, label] of [
  ["studentB", "student B"],
  ["studentA", "student A, who holds a grant"],
  ["mentor", "the mentor"],
  ["rivalAdmin", "an admin of another organisation"],
  [null, "an anonymous caller"],
]) {
  const res = await directObjectFetch(who);
  record(
    `${label} is refused the object directly at the storage path`,
    !res.ok,
    `HTTP ${res.status}`,
  );
}

const adminDirect = await directObjectFetch("admin");
record(
  "an admin of the owning organisation may read the object directly",
  adminDirect.ok,
  `HTTP ${adminDirect.status}`,
);

// A student cannot write into the bucket either.
const studentUpload = await fetch(
  `${URL_}/storage/v1/object/documents/org/1/11111111-2222-3333-4444-555555555555.pdf`,
  {
    method: "POST",
    headers: {
      apikey: PUB,
      authorization: `Bearer ${state.people.studentB.accessToken}`,
      "content-type": "application/pdf",
    },
    body: pdf,
  },
);
record(
  "a student cannot upload into the documents bucket",
  !studentUpload.ok,
  `HTTP ${studentUpload.status}`,
);

// ------------------------------------------------- F. database-level guards
const { error: crossOrgGrant } = await admin.from("content_access").insert({
  granted_by: state.people.rivalAdmin.id,
  org_id: 5,
  resource_id: documentRow.id,
  resource_type: "document",
  student_id: state.people.studentB.id,
});
record(
  "the database refuses a grant for a document in another organisation",
  Boolean(crossOrgGrant),
  crossOrgGrant?.message?.slice(0, 80) ?? "it was allowed",
);

const { error: phantomGrant } = await admin.from("content_access").insert({
  granted_by: state.people.admin.id,
  org_id: 1,
  resource_id: 999999999,
  resource_type: "document",
  student_id: state.people.studentA.id,
});
record(
  "the database refuses a grant naming a document that does not exist",
  Boolean(phantomGrant),
  phantomGrant?.message?.slice(0, 80) ?? "it was allowed",
);

const { error: badPath } = await admin.from("documents").insert({
  folder: "",
  org_id: 1,
  storage_path: "org/1/../../secrets.pdf",
  title: "Traversal attempt",
  uploaded_by: state.people.admin.id,
});
record(
  "the database refuses a storage path that escapes the organisation prefix",
  Boolean(badPath),
  badPath?.message?.slice(0, 80) ?? "it was allowed",
);

// ------------------------------------------------------------------ summary
const failed = results.filter((r) => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
if (failed.length > 0) {
  console.log("failing:");
  for (const f of failed) console.log(`  - ${f.name} (${f.detail})`);
  process.exit(1);
}
