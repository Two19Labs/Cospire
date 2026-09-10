// Removes everything the verification run created, in dependency order, then
// prints the live counts so they can be compared against the baseline.
// node --env-file=.env.local scripts/verify/teardown.mjs <state.json>
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const state = JSON.parse(readFileSync(process.argv[2], "utf8"));
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Everything removed here is scoped to the accounts this run created. An
// earlier version deleted every document grant and every document row, which
// was equivalent while the baseline held none of either. It stopped being
// equivalent the moment the owner uploaded real content, and would have taken
// their PDFs out of Storage with no backup to restore from.
const runIds = Object.values(state.people ?? {}).map((person) => person.id);
if (runIds.length === 0) {
  throw new Error(
    "state.json names no accounts; refusing to delete anything unscoped",
  );
}

// Order is forced by the schema. content_access.granted_by and
// documents.uploaded_by both reference profiles with ON DELETE RESTRICT, so the
// grants and the documents have to go before the accounts that made them.
let removedGrants = 0;
for (const column of ["granted_by", "student_id"]) {
  const { data } = await admin
    .from("content_access")
    .delete()
    .in(column, runIds)
    .select("id");
  removedGrants += (data ?? []).length;
}
console.log(`removed ${removedGrants} content_access rows`);

const { data: documents } = await admin
  .from("documents")
  .select("id, storage_path")
  .in("uploaded_by", runIds);

if ((documents ?? []).length > 0) {
  const paths = documents.map((d) => d.storage_path);
  const { error: removeError } = await admin.storage
    .from("documents")
    .remove(paths);
  console.log(
    `removed ${paths.length} storage objects${removeError ? ` (${removeError.message})` : ""}`,
  );

  const { data: deleted } = await admin
    .from("documents")
    .delete()
    .in(
      "id",
      documents.map((d) => d.id),
    )
    .select("id");
  console.log(`removed ${(deleted ?? []).length} document rows`);
}

for (const [key, person] of Object.entries(state.people ?? {})) {
  const { error } = await admin.auth.admin.deleteUser(person.id);
  console.log(`removed ${key}: ${error ? error.message : "ok"}`);
}

const counts = {};
for (const [label, table] of [
  ["orgs", "orgs"],
  ["profiles", "profiles"],
  ["mentor_assignments", "mentor_assignments"],
  ["content_access", "content_access"],
  ["documents", "documents"],
]) {
  const { count } = await admin
    .from(table)
    .select("*", { count: "exact", head: true });
  counts[label] = count;
}

const { data: objects } = await admin.storage.from("documents").list("org/1");
counts["storage objects under org/1"] = (objects ?? []).length;

console.log("\nlive counts after teardown:");
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
