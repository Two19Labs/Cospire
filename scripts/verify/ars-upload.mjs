// Exercises the ARS upload bucket with real sessions and throwaway rows.
// node --env-file=.env.local scripts/verify/ars-upload.mjs
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL || !PUB || !SECRET) throw new Error("missing supabase env");

const admin = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const password = `UploadVerify${stamp}x`;
const orgId = 1;
const people = {};
const objectPaths = [];
let courseId = null;
let roundId = null;
const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}

async function person(key, role) {
  const email = `ars-upload-${key}-${stamp}@example.com`;
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw made.error;
  const id = made.data.user.id;
  const profile = await admin.from("profiles").insert({ id, org_id: orgId, role, name: `Upload ${key}`, email });
  if (profile.error) throw profile.error;
  const client = createClient(URL, PUB, { auth: { autoRefreshToken: false, persistSession: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  people[key] = { client, id };
}

try {
  await person("student", "student");
  await person("other", "student");
  await person("mentor", "mentor");
  await person("admin", "admin");

  const course = await admin.from("courses").insert({ org_id: orgId, title: `Upload Verify ${stamp}` }).select("id").single();
  if (course.error) throw course.error;
  courseId = course.data.id;
  const round = await admin.from("ars_rounds").insert({
    org_id: orgId,
    course_id: courseId,
    name: "Documents",
    submission_mode: "form",
    sort_order: 1,
    config: { steps: [{ key: "docs", title: "Documents", sections: [{ fields: [
      { key: "marksheet", label: "Marksheet", type: "file", required: true, accept: ["pdf"] },
      { key: "transcript", label: "Transcript", type: "file", accept: ["pdf"] },
    ] }] }] },
  }).select("id").single();
  if (round.error) throw round.error;
  roundId = round.data.id;

  await admin.from("content_access").insert({
    org_id: orgId,
    student_id: people.student.id,
    resource_type: "course",
    resource_id: courseId,
    granted_by: people.admin.id,
  });
  await admin.from("mentor_assignments").insert({
    org_id: orgId,
    mentor_id: people.mentor.id,
    student_id: people.student.id,
    assigned_by: people.admin.id,
  });

  const draft = await people.student.client.from("ars_submissions").insert({
    answer: {}, org_id: orgId, round_id: roundId, status: "draft", student_id: people.student.id,
  }).select("id").single();
  if (draft.error) throw draft.error;

  const first = `org/${orgId}/ars/${people.student.id}/${randomUUID()}.pdf`;
  const second = `org/${orgId}/ars/${people.student.id}/${randomUUID()}.pdf`;
  objectPaths.push(first, second);
  const bytes = new TextEncoder().encode("%PDF-1.4 upload verification");
  const one = await people.student.client.storage.from("ars-uploads").upload(first, bytes, { contentType: "application/pdf" });
  const two = await people.student.client.storage.from("ars-uploads").upload(second, bytes, { contentType: "application/pdf" });
  record("a student uploads two distinct file fields", !one.error && !two.error, one.error?.message ?? two.error?.message);

  const answer = {
    marksheet: { storagePath: first, originalName: "marksheet.pdf", mimeType: "application/pdf", size: bytes.length },
    transcript: { storagePath: second, originalName: "transcript.pdf", mimeType: "application/pdf", size: bytes.length },
  };
  const attached = await people.student.client.from("ars_submissions").update({ answer }).eq("id", draft.data.id).select("id");
  record("both uploads attach to one draft", !attached.error && attached.data?.length === 1);

  const mentorDraft = await people.mentor.client.storage.from("ars-uploads").download(first);
  record("the mentor cannot read a draft upload", Boolean(mentorDraft.error));

  const replaced = await people.student.client.storage.from("ars-uploads").update(first, new TextEncoder().encode("%PDF replacement"), { contentType: "application/pdf" });
  record("the student can replace a draft upload", !replaced.error, replaced.error?.message);
  const removed = await people.student.client.storage.from("ars-uploads").remove([second]);
  record("the student can remove a draft upload", !removed.error, removed.error?.message);
  await people.student.client.storage.from("ars-uploads").upload(second, bytes, { contentType: "application/pdf" });

  const submitted = await people.student.client.from("ars_submissions").update({ status: "submitted" }).eq("id", draft.data.id).select("id");
  record("the draft with two uploads can be handed in", !submitted.error && submitted.data?.length === 1, submitted.error?.message);

  const mentorRead = await people.mentor.client.storage.from("ars-uploads").download(first);
  record("the assigned mentor reads a handed-in upload", !mentorRead.error, mentorRead.error?.message);
  const strangerRead = await people.other.client.storage.from("ars-uploads").download(first);
  record("another student cannot read the upload", Boolean(strangerRead.error));
  const lockedUpdate = await people.student.client.storage.from("ars-uploads").update(first, bytes, { contentType: "application/pdf" });
  record("a handed-in upload cannot be replaced", Boolean(lockedUpdate.error));
  const lockedDelete = await people.student.client.storage.from("ars-uploads").remove([first]);
  const stillThere = await admin.storage.from("ars-uploads").download(first);
  record(
    "a handed-in upload cannot be deleted",
    !stillThere.error,
    lockedDelete.error?.message ?? `${lockedDelete.data?.length ?? 0} rows reported deleted`,
  );
} catch (error) {
  record("verification completed without throwing", false, String(error));
} finally {
  if (objectPaths.length) await admin.storage.from("ars-uploads").remove(objectPaths);
  if (roundId) await admin.from("ars_submissions").delete().eq("round_id", roundId);
  if (courseId) {
    await admin.from("ars_process_runs").delete().eq("course_id", courseId);
    await admin.from("content_access").delete().eq("resource_type", "course").eq("resource_id", courseId);
    await admin.from("ars_rounds").delete().eq("course_id", courseId);
    await admin.from("courses").delete().eq("id", courseId);
  }
  for (const entry of Object.values(people)) await admin.auth.admin.deleteUser(entry.id);
  const failed = results.filter((result) => !result.pass).length;
  console.log(`\n${results.length - failed} of ${results.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
