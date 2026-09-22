import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// Every signed-in screen gets a skeleton of its own shape.
//
// A route with no loading.tsx still shows one -- its parent's -- and that is the
// failure this guards against: clicking from a list into a detail screen showed
// the list's skeleton, under the list's title, so the click looked as though it
// had not landed. Seen for students and mentors in the 2026-09-21 client demo.
const appDir = join(process.cwd(), "src", "app");

function pageDirs(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const here = entries.some((entry) => entry.isFile() && entry.name === "page.tsx") ? [dir] : [];
  return here.concat(
    entries.filter((entry) => entry.isDirectory()).flatMap((entry) => pageDirs(join(dir, entry.name))),
  );
}

describe("loading skeletons", () => {
  for (const role of ["admin", "mentor", "student"]) {
    it(`every ${role} screen has its own loading.tsx`, () => {
      const missing = pageDirs(join(appDir, role))
        .filter((dir) => !existsSync(join(dir, "loading.tsx")))
        .map((dir) => relative(appDir, dir).replace(/\\/g, "/"));
      expect(missing).toEqual([]);
    });
  }
});
