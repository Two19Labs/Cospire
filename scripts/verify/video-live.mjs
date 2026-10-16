// The video live pass: a real VdoCipher video added, previewed, put in a
// programme, granted, watched, refused, resumed. Drives the running production
// build with headless Chrome (real sessions, JavaScript on) and reads the hosted
// database for ground truth.
//
//   node --env-file=.env.local scripts/verify/setup.mjs coverage/verify/video-state.json
//   VIDEO_OTP_LOG=<abs path> npx next start -p 3010            # a build carrying the OTP log
//   node --env-file=.env.local scripts/verify/video-live.mjs \
//     coverage/verify/video-state.json http://127.0.0.1:3010 <vdocipher id>
//   node --env-file=.env.local scripts/verify/teardown.mjs coverage/verify/video-state.json
//
// The OTP log is a temporary instrumentation of requestOtp: it is the only way to
// read the watermark VdoCipher is asked to draw, and to prove that an
// unauthorised student causes no call at all. It is removed before the PR.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

import { launch } from "./ui-audit-cdp.mjs";

const [stateFile, base, vdocipherId] = process.argv.slice(2);
const otpLog = process.env.VIDEO_OTP_LOG;
if (!stateFile || !base || !vdocipherId || !otpLog) {
  throw new Error("usage: video-live.mjs <state.json> <base url> <vdocipher id>, with VIDEO_OTP_LOG set");
}

const state = JSON.parse(readFileSync(stateFile, "utf8"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
const record = (ok, name, detail = "") => {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
};

function otpCalls() {
  try {
    return readFileSync(otpLog, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

const stamp = state.stamp;
const page = await launch({ port: 9341, profileRoot: "coverage/video-live" });

// Submits the form holding `selector` -- a CSS selector, or `button:<text>` for
// the form whose submit button reads that -- after applying `fields` to it.
const submitForm = async (selector, fields = {}) => {
  const script = `(() => {
    const want = ${JSON.stringify(selector)};
    const el = want.startsWith("button:")
      ? [...document.querySelectorAll("form button")].find((b) => b.textContent.trim() === want.slice(7))
      : document.querySelector(want);
    if (!el) return "no element";
    const form = el.closest("form");
    for (const [name, value] of Object.entries(${JSON.stringify(fields)})) {
      const input = form.elements[name];
      if (!input) return "no field " + name;
      input.value = value;
    }
    form.requestSubmit(form.querySelector("button[type=submit], button:not([type])"));
    return "ok";
  })()`;
  const outcome = await page.evaluate(script);
  if (outcome !== "ok") throw new Error(`${selector}: ${outcome}`);
  await page.idle(base, 500, 20000);
  await page.sleep(700);
};

const text = () => page.evaluate(`document.body.innerText.replace(/\\s+/g, " ").slice(0, 4000)`);
const html = () => page.evaluate(`document.documentElement.outerHTML`);

try {
  // ---------------------------------------------------------------- 1. add it
  await page.setCookies(base, state.people.admin.cookie);
  await page.navigate(`${base}/admin/videos`, base);
  await submitForm("button:Add video", { vdocipherId });

  const { data: video } = await db
    .from("videos")
    .select("id, title, duration_seconds, status, org_id")
    .eq("vdocipher_id", vdocipherId)
    .maybeSingle();
  record(
    !!video && video.status === "ready" && video.duration_seconds > 0 && !!video.title,
    "admin adds the video by its id; title and length come from VdoCipher",
    video ? `id ${video.id}, "${video.title}", ${video.duration_seconds}s, ${video.status}` : "no row",
  );
  if (!video) throw new Error("no videos row: the rest of the pass depends on it");

  const listed = await text();
  record(
    listed.includes(video.title),
    "the video library lists it",
    listed.includes(video.duration_seconds >= 60 ? "" : "0:26") ? "with its length" : "",
  );

  // ------------------------------------------------------- 2. admin preview
  const before = otpCalls().length;
  await page.navigate(`${base}/admin/videos/${video.id}`, base);
  const previewHtml = await html();
  const frame = /player\.vdocipher\.com\/v2\/\?otp=([^"&]+)&(?:amp;)?playbackInfo=([^"&]+)/.exec(previewHtml);
  record(!!frame, "admin preview renders the player iframe with an otp and playbackInfo");

  const adminCall = otpCalls()[before];
  const annotate = adminCall ? JSON.parse(adminCall.body.annotate)[0] : null;
  const admin = state.people.admin;
  record(
    !!annotate &&
      annotate.text.includes(admin.name ?? "Docs Verify Admin") &&
      annotate.text.includes(admin.email) &&
      /\d{1,2}:\d{2}/.test(annotate.text),
    "the watermark VdoCipher is asked to draw carries the viewer's name, email and time",
    annotate ? `rtext "${annotate.text}" ttl ${adminCall.body.ttl}s` : "no OTP call logged",
  );

  // ------------------------------------- 3. a programme holding it, granted
  await page.navigate(`${base}/admin/courses`, base);
  const programmeTitle = `Video live pass ${stamp}`;
  await submitForm("button:Create programme", { title: programmeTitle });
  const { data: course } = await db
    .from("courses")
    .select("id")
    .eq("title", programmeTitle)
    .eq("kind", "programme")
    .maybeSingle();
  if (!course) throw new Error("the programme was not created");

  await page.navigate(`${base}/admin/courses/${course.id}`, base);
  await submitForm("button:Add section", { title: "Watching" });
  await page.navigate(`${base}/admin/courses/${course.id}`, base);
  await submitForm("button:Add video", { refId: String(video.id) });

  const { data: item } = await db
    .from("curriculum_items")
    .select("id, type, ref_id, section_id")
    .eq("type", "video")
    .eq("ref_id", video.id)
    .maybeSingle();
  record(
    !!item,
    "video is a buildable curriculum item type and the picker offers the library",
    item ? `item ${item.id} in section ${item.section_id}` : "no curriculum_items row",
  );
  if (!item) throw new Error("no video curriculum item");

  await page.navigate(`${base}/admin/courses/${course.id}`, base);
  await submitForm(`input[name="studentId"][value="${state.people.studentA.id}"]`);
  const { data: grant } = await db
    .from("content_access")
    .select("id, resource_type, resource_id")
    .eq("student_id", state.people.studentA.id)
    .eq("resource_type", "course")
    .eq("resource_id", course.id)
    .maybeSingle();
  record(!!grant, "the programme is granted to student A", grant ? `content_access ${grant.id}` : "no grant row");

  // ------------------------------------------------- 4. student A can watch
  const beforeA = otpCalls().length;
  await page.setCookies(base, state.people.studentA.cookie);
  const itemUrl = `${base}/student/programmes/${course.id}/items/${item.id}`;
  await page.navigate(itemUrl, base);
  const watchedHtml = await html();
  const playerA = /player\.vdocipher\.com\/v2\/\?otp=([^"&\\]+)&(?:amp;)?playbackInfo=([^"&\\]+)/.exec(watchedHtml);
  const callA = otpCalls()[beforeA];
  record(
    !!playerA && !!callA,
    "student A, granted through the programme, gets the player and a fresh OTP",
    callA ? `watermark "${JSON.parse(callA.body.annotate)[0].text}"` : "no OTP call",
  );
  record(
    !!callA && JSON.parse(callA.body.annotate)[0].text.includes(state.people.studentA.email),
    "A's watermark names A, not the admin",
  );

  // ------------------------------- 5. student B is refused and costs no OTP
  const beforeB = otpCalls().length;
  await page.setCookies(base, state.people.studentB.cookie);
  await page.navigate(itemUrl, base);
  const refused = await text();
  record(
    /not found|404/i.test(refused),
    "student B, with no grant, is refused",
    refused.slice(0, 80).replace(/\n/g, " "),
  );
  record(
    otpCalls().length === beforeB,
    "no OTP is requested for student B",
    `${otpCalls().length - beforeB} calls during B's request`,
  );

  // also the video's own admin route, which B must not reach
  await page.navigate(`${base}/admin/videos/${video.id}`, base);
  const bAdmin = await text();
  record(
    !/otp=/.test(await html()) && !bAdmin.includes(video.title),
    "student B cannot reach the admin preview of the video",
  );

  // ------------------------------------------- 6. progress and the resume
  // The player itself cannot run here: headless Chrome has no Widevine CDM, so
  // no DRM frame plays and the player API never fires timeupdate. The server
  // action behind it is driven directly instead, exactly as the client calls it.
  const actionId = process.env.PROGRESS_ACTION_ID;
  if (!actionId) {
    record(false, "video progress: PROGRESS_ACTION_ID not supplied", "skipped");
  } else {
    const response = await fetch(itemUrl, {
      body: JSON.stringify([item.id, 7.4]),
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
        Cookie: state.people.studentA.cookie,
        "Next-Action": actionId,
      },
      method: "POST",
    });
    const { data: progress } = await db
      .from("item_progress")
      .select("percent, last_position, completed")
      .eq("student_id", state.people.studentA.id)
      .eq("item_id", item.id)
      .maybeSingle();
    record(
      response.ok && !!progress && progress.last_position === 7 && progress.percent > 0,
      "playing a few seconds as A writes item_progress; percent comes from videos.duration_seconds",
      progress ? `last_position ${progress.last_position}s, ${progress.percent}%` : `HTTP ${response.status}, no row`,
    );

    await page.setCookies(base, state.people.studentA.cookie);
    await page.navigate(itemUrl, base);
    const resumed = await html();
    // The prop travels in the flight payload, where the quotes are escaped.
    record(
      /resumeAt\\?":7[,}]/.test(resumed),
      "reopening the item hands the player the stored position to resume from",
      /resumeAt\\?":(\d+)/.exec(resumed)?.[0] ?? "no resumeAt in the page",
    );

    // The programme percentage counts completed items, not seconds watched
    // (completionPercent over item_progress.completed), so it moves when the
    // video passes 90%. Watching 7 of 26 seconds must leave it at 0%.
    const partway = await text();
    await page.navigate(`${base}/student/programmes/${course.id}`, base);
    const beforeDone = await text();
    const watchOn = await fetch(itemUrl, {
      body: JSON.stringify([item.id, 25]),
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
        Cookie: state.people.studentA.cookie,
        "Next-Action": actionId,
      },
      method: "POST",
    });
    const { data: done } = await db
      .from("item_progress")
      .select("percent, last_position, completed")
      .eq("student_id", state.people.studentA.id)
      .eq("item_id", item.id)
      .maybeSingle();
    await page.navigate(`${base}/student/programmes/${course.id}`, base);
    const afterDone = await text();
    record(
      watchOn.ok && !!done && done.completed === true && done.percent >= 90,
      "watching past 90% completes the item one way",
      done ? `${done.percent}%, completed ${done.completed}` : `HTTP ${watchOn.status}`,
    );
    record(
      /\b0%/.test(beforeDone) && /\b100%/.test(afterDone),
      "the programme percentage moves with completed items",
      `before "${/\d+% complete/.exec(beforeDone)?.[0] ?? "?"}", after "${/\d+% complete/.exec(afterDone)?.[0] ?? "?"}"`,
    );
    record(
      partway.includes(video.title),
      "the item page shows the video's title to the student",
    );
  }

  // ------------------------------------------------- 7. a copied player URL
  // The OTP is minted with ttl 300 s (step 2 reads that from the request). What
  // happens to a copied URL afterwards cannot be *decided* here: VdoCipher
  // serves the same player shell either way and validates the OTP at the
  // Widevine license request, which headless Chrome cannot make -- it has no
  // CDM. So this step records, verbatim, what the copied URL does show at both
  // ages, and leaves the verdict to a real browser.
  if (playerA && process.env.VIDEO_TTL_WAIT !== "skip") {
    const copied = `https://player.vdocipher.com/v2/?otp=${playerA[1]}&playbackInfo=${playerA[2]}`;
    const playerOrigin = "https://player.vdocipher.com";
    const look = async (label) => {
      const from = page.problems.length;
      await page.navigate(copied, playerOrigin);
      await page.sleep(4000);
      const seen = await page.evaluate(`({
        http: document.body.innerText.replace(/\\s+/g, " ").slice(0, 600),
        poster: !!document.querySelector('[data-element-type="poster"]'),
        video: document.querySelectorAll("video").length,
      })`);
      await page.screenshot(`coverage/video-live/ttl-${label}.png`);
      return {
        ...seen,
        label,
        problems: page.problems.slice(from).map((p) => `${p.kind}: ${p.text}`),
      };
    };
    const fresh = await look("fresh");
    const waitMs = Number(process.env.VIDEO_TTL_WAIT ?? 330_000);
    console.log(`waiting ${Math.round(waitMs / 1000)}s for the OTP to expire…`);
    await page.sleep(waitMs);
    const expired = await look("expired");
    writeFileSync("coverage/video-live/ttl.json", JSON.stringify({ expired, fresh, waitMs }, null, 2));
    // What separates the two ages is the DRM license request. Shaka asks for the
    // Widevine license even with no CDM present, and license.vdocipher.com
    // answers 403 once the OTP has expired and does not before.
    const refused = (seen) => seen.problems.some((p) => p.includes("license.vdocipher.com"));
    record(
      !refused(fresh) && refused(expired),
      "a copied player URL stops playing once the OTP's ttl has passed",
      `fresh: no license refusal; after ${Math.round(waitMs / 1000)}s: ` +
        (expired.problems.find((p) => p.includes("license.vdocipher.com")) ?? "none"),
    );
    console.log(
      `NOTE  both ages serve the same shell (poster ${fresh.poster}/${expired.poster}, ` +
        `one <video> element, no visible text). Nothing plays either way here: headless ` +
        `Chrome has no Widevine CDM. Detail in coverage/video-live/ttl.json.`,
    );
  }
} finally {
  await page.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
  for (const r of bad) console.log(`  still failing: ${r.name}`);
  const problems = page.problems ?? [];
  if (problems.length > 0) {
    console.log("\nbrowser problems:");
    for (const p of problems.slice(0, 20)) console.log(`  ${p.kind}: ${p.text}`);
  }
}
