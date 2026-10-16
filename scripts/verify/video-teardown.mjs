// Removes what the video live pass created, then prints the live counts the
// baseline is compared against. Run before scripts/verify/teardown.mjs, which
// deletes the accounts these rows point at.
//
//   node --env-file=.env.local scripts/verify/video-teardown.mjs <vdocipher id>
//
// Scoped like teardown.mjs: the one video of this run, by its VdoCipher id, and
// the programmes this pass names. It never deletes a video or programme it did
// not create -- the owner's real content lives in the same tables.
import { createClient } from "@supabase/supabase-js";

const vdocipherId = process.argv[2];
if (!vdocipherId) throw new Error("usage: video-teardown.mjs <vdocipher id>");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// The programme goes first: its sections and items cascade, and that takes the
// item_progress rows with them.
const { data: courses } = await db
  .from("courses")
  .delete()
  .like("title", "Video live pass %")
  .select("id, title");
console.log(`removed ${(courses ?? []).length} programmes: ${(courses ?? []).map((c) => c.id).join(", ")}`);

// The delete trigger on `videos` removes its grants and any curriculum item
// still pointing at it.
const { data: videos, error } = await db
  .from("videos")
  .delete()
  .eq("vdocipher_id", vdocipherId)
  .select("id, title");
console.log(`removed ${(videos ?? []).length} videos${error ? ` (${error.message})` : ""}`);

const counts = {};
for (const table of ["videos", "courses", "sections", "curriculum_items", "item_progress", "content_access"]) {
  const { count } = await db.from(table).select("*", { count: "exact", head: true });
  counts[table] = count;
}
console.log("\nlive counts:");
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
