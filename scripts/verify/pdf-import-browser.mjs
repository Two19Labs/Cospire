// The PDF upload in a real browser: the half `pdf-import.mjs` cannot reach.
//
// That harness runs `readPdf` in Node. This one proves the browser path the
// admin actually takes -- PDF.js's standard build and its worker loading from
// the production bundle, the React handler, the uploads under the admin's own
// session -- by choosing a file on /admin/questions/import in headless Chrome
// and reading what step 2 says came out.
//
//   node --env-file=.env.local scripts/verify/pdf-import-browser.mjs <baseUrl> <paper.pdf> [expectedPictures]
//
// The paper is any PDF on disk; it is read in the browser and never committed.
// Cleanup removes the throwaway admin and every picture the run put in the
// bucket, found by listing the folder before and after.

import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

import { launch } from "./ui-audit-cdp.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3030";
const PAPER = process.argv[3];
const EXPECTED = process.argv[4] ? Number(process.argv[4]) : null;
if (!PAPER) throw new Error("usage: pdf-import-browser.mjs <baseUrl> <paper.pdf> [expectedPictures]");

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUB || !SECRET) throw new Error("missing supabase env");
const service = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });

const ORG = 1;
const FOLDER = `org/${ORG}/questions`;
const stamp = Date.now();
const email = `pdfbrowser-admin-${stamp}@example.com`;
const password = `PdfBrowser${stamp}x`;

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}

async function listFolder() {
  const names = new Set();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await service.storage.from("question-images").list(FOLDER, { limit: 1000, offset });
    for (const item of data ?? []) names.add(item.name);
    if (!data || data.length < 1000) return names;
  }
}

let userId = null;
let browser = null;
const before = await listFolder();

try {
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, password });
  if (error) throw new Error(error.message);
  userId = data.user.id;
  const { error: profileError } = await service
    .from("profiles")
    .insert({ email, id: userId, name: "Pdf browser", org_id: ORG, role: "admin" });
  if (profileError) throw new Error(profileError.message);

  const jar = [];
  const ssr = createServerClient(URL_, PUB, { cookies: { getAll: () => [], setAll: (list) => jar.push(...list) } });
  const { error: signInError } = await ssr.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(signInError.message);

  browser = await launch({ port: 9334, profileRoot: "coverage/pdf-import-browser" });
  await browser.setCookies(BASE, jar.map((c) => `${c.name}=${c.value}`).join("; "));
  await browser.navigate(`${BASE}/admin/questions/import`, BASE);

  const { root } = await browser.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await browser.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
  record("the import screen has a file input that takes a PDF", nodeId > 0 && (await browser.evaluate(`document.querySelector('input[type="file"]').accept.includes(".pdf")`)));

  const started = Date.now();
  await browser.send("DOM.setFileInputFiles", { files: [resolve(PAPER)], nodeId });

  // Step 2 replaces step 1 once the paper is read and its pictures uploaded.
  let outcome = null;
  while (Date.now() - started < 90000 && !outcome) {
    await browser.sleep(250);
    outcome = await browser.evaluate(`(() => {
      const error = document.querySelector('[role="alert"]');
      if (error && error.textContent.trim()) return { error: error.textContent.trim() };
      const summary = [...document.querySelectorAll("p")].map((p) => p.textContent).find((t) => /\\d+ pictures? taken out|No pictures in it|none of which/.test(t));
      return summary ? { summary } : null;
    })()`);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (!outcome) {
    await browser.screenshot("coverage/pdf-import-browser/timeout.png");
    const timeline = browser.requests
      .filter((r) => r.t >= started && (/storage\/v1|pdf\.worker/.test(r.url)))
      .map((r) => `${((r.t - started) / 1000).toFixed(1)}s ${r.method} ${r.url.split("/").pop().slice(0, 24)} ${r.end ? `${r.end - r.t}ms` : "NEVER FINISHED"}`);
    console.log(`timeline:\n  ${timeline.join("\n  ")}`);
  }
  record("the browser reads the PDF and reaches step 2 without an error", Boolean(outcome && !outcome.error), outcome ? JSON.stringify(outcome) : "timed out");

  const taken = Number(outcome?.summary?.match(/(\d+) pictures? taken out/)?.[1] ?? 0);
  record(
    `the pictures are taken out and uploaded in the browser${EXPECTED === null ? "" : `, all ${EXPECTED} of them`}`,
    EXPECTED === null ? taken > 0 : taken === EXPECTED,
    `${taken} in ${seconds}s`,
  );

  const after = await listFolder();
  const added = [...after].filter((name) => !before.has(name));
  record("each picture is a new object in the bucket", added.length === taken, `${added.length} new objects`);

  const worker = browser.requests.some((r) => /pdf\.worker/.test(r.url));
  record("PDF.js's worker loaded from the production bundle", worker);
  const problems = browser.problems.filter((p) => !/favicon/.test(p.text));
  record("no console errors, exceptions or failed requests", problems.length === 0, JSON.stringify(problems.slice(0, 3)));
} catch (error) {
  record("run completed without throwing", false, String(error));
} finally {
  if (browser) await browser.close();
  const after = await listFolder();
  const added = [...after].filter((name) => !before.has(name)).map((name) => `${FOLDER}/${name}`);
  if (added.length) await service.storage.from("question-images").remove(added);
  if (userId) await service.auth.admin.deleteUser(userId);
  const left = await listFolder();
  const { count } = await service.from("profiles").select("*", { count: "exact", head: true });
  console.log(`\ncleanup: removed ${added.length} objects; ${left.size} objects in ${FOLDER} (was ${before.size}); profiles ${count}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(`${results.length - failed} of ${results.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
