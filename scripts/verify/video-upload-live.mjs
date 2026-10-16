// Upload from the platform, end to end and then undone: a tiny generated clip
// goes through the real browser form to VdoCipher's storage, the row is
// refreshed until VdoCipher reports it ready, and the video is then deleted from
// VdoCipher and from `videos`.
//
//   ffmpeg -f lavfi -i testsrc=duration=2:size=320x240:rate=15 -pix_fmt yuv420p coverage/video-live/clip.mp4
//   node --env-file=.env.local scripts/verify/video-upload-live.mjs \
//     coverage/verify/video-state.json http://127.0.0.1:3010 coverage/video-live/clip.mp4
//
// The account is the Client's, so nothing may be left behind: the delete runs in
// `finally`, and the script reports what it removed.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { launch } from "./ui-audit-cdp.mjs";

const [stateFile, base, clip] = process.argv.slice(2);
if (!stateFile || !base || !clip) throw new Error("usage: video-upload-live.mjs <state.json> <base url> <clip>");

const state = JSON.parse(readFileSync(stateFile, "utf8"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const api = (path, method) =>
  fetch(`https://dev.vdocipher.com/api${path}`, {
    headers: { Accept: "application/json", Authorization: `Apisecret ${process.env.VDOCIPHER_API_SECRET}` },
    method,
  });

const title = `Live pass clip ${state.stamp}`;
const record = (ok, name, detail = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
const page = await launch({ port: 9343, profileRoot: "coverage/video-live" });
let uploaded = null;

try {
  await page.setCookies(base, state.people.admin.cookie);
  await page.navigate(`${base}/admin/videos`, base);

  await page.send("DOM.enable");
  const { root } = await page.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
  if (!nodeId) throw new Error("no file input on /admin/videos");
  await page.send("DOM.setFileInputFiles", { files: [resolve(clip)], nodeId });
  await page.evaluate(`(() => {
    const form = document.querySelector('input[type=file]').closest("form");
    form.elements.title.value = ${JSON.stringify(title)};
    form.requestSubmit(form.querySelector("button[type=submit]"));
    return "ok";
  })()`);

  // The transfer leaves for VdoCipher's storage, so page.idle (which watches our
  // own origin) cannot see it. Wait for the row instead.
  for (let i = 0; i < 40 && !uploaded; i += 1) {
    await page.sleep(1500);
    const { data } = await db.from("videos").select("id, vdocipher_id, status").eq("title", title).maybeSingle();
    if (data) uploaded = data;
  }
  record(!!uploaded, "the upload form writes the row before the transfer", uploaded ? `video ${uploaded.id}, ${uploaded.status}` : "no row");
  if (!uploaded) throw new Error("no videos row");

  const notice = await page.evaluate(`location.pathname + location.search`);
  record(
    notice.includes("notice=upload-ready"),
    "the browser posted the file straight to VdoCipher and got 201",
    notice,
  );

  // "Refresh status" until VdoCipher has processed it.
  let status = uploaded.status;
  for (let i = 0; i < 20 && status !== "ready"; i += 1) {
    await page.navigate(`${base}/admin/videos`, base);
    await page.evaluate(`(() => {
      const input = document.querySelector('input[name=videoId][value="${uploaded.id}"]');
      if (!input) return "gone";
      const form = input.closest("form");
      form.requestSubmit(form.querySelector("button"));
      return "ok";
    })()`);
    await page.idle(base, 500, 20000);
    await page.sleep(2500);
    const { data } = await db.from("videos").select("status, duration_seconds").eq("id", uploaded.id).maybeSingle();
    status = data?.status ?? status;
    console.log(`  refresh ${i + 1}: ${status}${data?.duration_seconds ? ` (${data.duration_seconds}s)` : ""}`);
  }
  record(status === "ready", `"Refresh status" carries the video to ready`, status);
} finally {
  if (uploaded) {
    const deleted = await api(`/videos?videos=${uploaded.vdocipher_id}`, "DELETE");
    const { data: gone } = await db.from("videos").delete().eq("id", uploaded.id).select("id");
    const check = await api(`/videos/${uploaded.vdocipher_id}`, "GET");
    record(
      deleted.ok && (gone ?? []).length === 1 && check.status !== 200,
      "the clip is deleted from VdoCipher and from the library",
      `DELETE ${deleted.status}, row removed ${(gone ?? []).length}, re-read ${check.status}`,
    );
  }
  await page.close();
}
