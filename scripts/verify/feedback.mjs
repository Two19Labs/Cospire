// The feedback board end to end, with no session: log a thought with a
// screenshot through the Client's link, answer it through the owner's, read the
// answer back through the Client's. The one thought it creates is deleted at
// the end. Needs FEEDBACK_CLIENT_CODE and FEEDBACK_OWNER_CODE in the environment.
//
//   node --env-file=.env.local scripts/verify/feedback.mjs http://127.0.0.1:3080
//
// Against a deployed URL it sends the owner one real notification email.
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] ?? "http://127.0.0.1:3080";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const client = process.env.FEEDBACK_CLIENT_CODE;
const owner = process.env.FEEDBACK_OWNER_CODE;
if (!client || !owner) throw new Error("missing FEEDBACK_CLIENT_CODE / FEEDBACK_OWNER_CODE");
const service = createClient(URL_, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const title = `Verify feedback ${stamp}`;
let passes = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
  if (!pass) throw new Error(name);
  passes += 1;
}
const page = async (code) => {
  const response = await fetch(`${BASE}/feedback/${code}`, { redirect: "manual" });
  return { body: await response.text(), status: response.status };
};

// A Server Action taking plain arguments, called as the browser calls it. The
// id is read from the page's own script chunks, where Next names each action.
async function actionId(html, name) {
  for (const src of [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)[^"]*"/g)].map((m) => m[1])) {
    const js = await (await fetch(`${BASE}${src}`)).text();
    const found = js.match(new RegExp(`createServerReference\\)?\\("([a-f0-9]+)"[^)]*"${name}"\\)`));
    if (found) return found[1];
  }
  throw new Error(`no action id for ${name}`);
}
async function call(code, id, args) {
  const response = await fetch(`${BASE}/feedback/${code}`, {
    body: JSON.stringify(args),
    headers: { "Content-Type": "text/plain;charset=UTF-8", "Next-Action": id },
    method: "POST",
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("1:"));
  return line ? JSON.parse(line.slice(2)) : { raw: text.slice(0, 200) };
}

const baseline = (await service.from("feedback_thoughts").select("id", { count: "exact", head: true })).count;
let thoughtId = null;
let shotPath = null;
try {
  check("a wrong code is not found", (await page("not-the-code")).status === 404);
  const form = await page(client);
  check("the Client's link opens with no session", form.status === 200 && form.body.includes("Share a thought"));
  check("the Client's link has no answer form", !form.body.includes('name="reply"'));

  const ticketId = await actionId(form.body, "feedbackUploadTicketAction");
  const addId = await actionId(form.body, "addThoughtAction");
  check("a wrong code gets no upload ticket", "error" in (await call(client, ticketId, ["wrong", "image/png"])));
  check("a PDF gets no upload ticket", "error" in (await call(client, ticketId, [client, "application/pdf"])));
  const ticket = await call(client, ticketId, [client, "image/png"]);
  check("an image gets an upload ticket", typeof ticket.path === "string" && typeof ticket.token === "string", JSON.stringify(ticket).slice(0, 120));
  shotPath = ticket.path;
  const png = fs.readFileSync(path.join(process.cwd(), "src/app/icon.png"));
  const upload = await anon.storage.from("feedback").uploadToSignedUrl(ticket.path, ticket.token, png, { contentType: "image/png" });
  check("the screenshot uploads on the ticket", !upload.error, upload.error?.message);
  const direct = await anon.storage.from("feedback").download(ticket.path);
  check("the screenshot is not readable without the server", Boolean(direct.error));

  check("a wrong code cannot log a thought", "error" in (await call(client, addId, ["wrong", { body: "x", title }])));
  check("an empty title is refused", "error" in (await call(client, addId, [client, { body: "x", title: " " }])));
  check("a path the server did not issue is refused", "error" in (await call(client, addId, [client, { body: "x", screenshots: ["../documents/a.pdf"], title }])));
  const added = await call(client, addId, [client, { authorName: "Verify", body: "A thought\nover two lines", screenshots: [ticket.path], title, urgent: true }]);
  check("a thought is logged", added.ok === true, JSON.stringify(added).slice(0, 160));
  const { data: row } = await service.from("feedback_thoughts").select("*").eq("title", title).single();
  thoughtId = row?.id ?? null;
  check("the row holds what was sent", row?.urgent === true && row.status === "new" && row.author_name === "Verify" && row.screenshots[0] === ticket.path && row.reply === null);

  const all = await page(owner);
  check("the owner's link lists it, urgent", all.status === 200 && all.body.includes(title) && all.body.includes("Urgent"));
  const shot = all.body.match(/<img[^>]+src="([^"]+feedback[^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
  check("the screenshot is shown through a signed link", Boolean(shot) && (await fetch(shot)).status === 200);

  // The owner's answer, as a no-JavaScript form post.
  const answerForm = [...all.body.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes(`name="id" value="${thoughtId}"`));
  if (!answerForm) throw new Error("no answer form for the thought");
  const data = new FormData();
  for (const [, name, value] of answerForm.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)) data.set(name, value ?? "");
  data.set("status", "planned");
  data.set("reply", `Answer ${stamp}`);
  const answered = await fetch(`${BASE}/feedback/${owner}`, { body: data, method: "POST", redirect: "manual" });
  const { data: after } = await service.from("feedback_thoughts").select("status, reply, replied_at").eq("id", thoughtId).single();
  check("the owner's answer and status are saved", answered.status === 303 && after.status === "planned" && after.reply === `Answer ${stamp}` && after.replied_at !== null, `${answered.status}`);

  const seen = await page(client);
  check("the Client's link shows the status and the answer", seen.body.includes(`Answer ${stamp}`) && seen.body.includes("Planned"));

  // The same form posted with the Client's code must change nothing.
  data.set("code", client);
  data.set("reply", "changed by the client link");
  await fetch(`${BASE}/feedback/${client}`, { body: data, method: "POST", redirect: "manual" });
  const { data: still } = await service.from("feedback_thoughts").select("reply").eq("id", thoughtId).single();
  check("the Client's code cannot answer", still.reply === `Answer ${stamp}`);
} finally {
  if (thoughtId) await service.from("feedback_thoughts").delete().eq("id", thoughtId);
  if (shotPath) await service.storage.from("feedback").remove([shotPath]);
  const after = (await service.from("feedback_thoughts").select("id", { count: "exact", head: true })).count;
  console.log(`\n${passes} passed; rows ${baseline} before, ${after} after`);
}
