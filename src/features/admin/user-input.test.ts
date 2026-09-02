import { describe, expect, it } from "vitest";

import {
  buildUsersHref,
  parsePageNumber,
  parseUserListError,
  sanitizeUserSearch,
} from "./list-params";
import {
  describePasswordProblem,
  normalizeEmail,
  normalizeName,
  validateNewUser,
} from "./user-input";

describe("sanitizeUserSearch", () => {
  it("keeps an ordinary name or address intact", () => {
    expect(sanitizeUserSearch("Priya Sharma")).toBe("Priya Sharma");
    expect(sanitizeUserSearch("a_b@cospire.in")).toBe("a_b@cospire.in");
  });

  // The reason this function exists. PostgREST parses `or=(...)` as a
  // comma-separated filter list, so an unescaped comma or parenthesis in the
  // search term would append a filter of the attacker's choosing rather than
  // being searched for.
  it("strips the characters that would rewrite a PostgREST filter", () => {
    const injected = sanitizeUserSearch('x,role.eq.admin,name.ilike."%');
    expect(injected).not.toContain(",");
    expect(injected).not.toContain('"');
    expect(injected).not.toContain("%");
    expect(sanitizeUserSearch("a(b)c\\d")).toBe("a b c d");
  });

  it("collapses whitespace and caps the length", () => {
    expect(sanitizeUserSearch("  Priya   Sharma  ")).toBe("Priya Sharma");
    expect(sanitizeUserSearch("z".repeat(200))).toHaveLength(80);
  });
});

describe("parsePageNumber", () => {
  it("falls back to the first page for anything that is not a page", () => {
    for (const raw of [undefined, "", "0", "-3", "abc", "1.5e9x", "NaN"]) {
      expect(parsePageNumber(raw)).toBe(1);
    }
  });

  it("accepts a real page number", () => {
    expect(parsePageNumber("2")).toBe(2);
    expect(parsePageNumber("47")).toBe(47);
  });
});

describe("buildUsersHref", () => {
  it("omits defaults so the plain list has a clean URL", () => {
    expect(buildUsersHref({ page: 1, search: "" })).toBe("/admin/users");
  });

  it("carries the page, search and error when they are set", () => {
    expect(buildUsersHref({ page: 3, search: "priya" })).toBe(
      "/admin/users?q=priya&page=3",
    );
    expect(
      buildUsersHref({ error: "assignment-failed", page: 1, search: "" }),
    ).toBe("/admin/users?error=assignment-failed");
  });

  // The reason the mentor form posts a page number and a search term rather
  // than a return URL. Whatever an attacker puts in those fields, the
  // destination stays on this origin and on this path.
  it("cannot be steered off the user list", () => {
    const hostile = buildUsersHref({
      page: 1,
      search: "https://evil.example/steal",
    });
    expect(hostile.startsWith("/admin/users?")).toBe(true);
    expect(hostile).not.toContain("//evil.example");
  });
});

describe("parseUserListError", () => {
  it("accepts only the codes the screen can render", () => {
    expect(parseUserListError("assignment-failed")).toBe("assignment-failed");
    expect(parseUserListError("invalid-request")).toBe("invalid-request");
  });

  it("rejects anything else, including inherited object keys", () => {
    for (const raw of [undefined, "", "nope", "toString", "constructor"]) {
      expect(parseUserListError(raw)).toBeNull();
    }
  });
});

describe("normalizeEmail and normalizeName", () => {
  it("matches what the database constraint requires", () => {
    // `profiles_email_normalized` checks `email = lower(btrim(email))`.
    expect(normalizeEmail("  Priya@Cospire.IN ")).toBe("priya@cospire.in");
  });

  it("collapses runs of whitespace in a name", () => {
    expect(normalizeName("  Priya   Sharma ")).toBe("Priya Sharma");
  });
});

describe("describePasswordProblem", () => {
  it("accepts a password meeting the pushed Supabase policy", () => {
    expect(describePasswordProblem("Cospire2026")).toBeNull();
  });

  it("names the specific missing requirement", () => {
    expect(describePasswordProblem("Ab1")).toMatch(/8 characters/);
    expect(describePasswordProblem("COSPIRE2026")).toMatch(/lowercase/);
    expect(describePasswordProblem("cospire2026")).toMatch(/uppercase/);
    expect(describePasswordProblem("CospireLMS")).toMatch(/digit/);
  });
});

describe("validateNewUser", () => {
  const valid = {
    email: "  Priya@Cospire.IN ",
    name: "  Priya   Sharma ",
    password: "Cospire2026",
    role: "student",
  };

  it("normalises a good row and returns it", () => {
    const { errors, value } = validateNewUser(valid);
    expect(errors).toEqual({});
    expect(value).toEqual({
      email: "priya@cospire.in",
      name: "Priya Sharma",
      password: "Cospire2026",
      role: "student",
    });
  });

  it("returns no value at all when any field is wrong", () => {
    // Bulk creation depends on this: one bad row must create nothing, so the
    // validator never hands back a partially usable result.
    const { value } = validateNewUser({ ...valid, email: "priya@cospire" });
    expect(value).toBeNull();
  });

  it("reports every bad field at once rather than one at a time", () => {
    const { errors } = validateNewUser({
      email: "not-an-email",
      name: "   ",
      password: "short",
      role: "superuser",
    });
    expect(Object.keys(errors).sort()).toEqual([
      "email",
      "name",
      "password",
      "role",
    ]);
  });

  it("rejects a role that is not one of the three", () => {
    expect(validateNewUser({ ...valid, role: "admin " }).value).toBeNull();
    expect(validateNewUser({ ...valid, role: null }).value).toBeNull();
    expect(validateNewUser({ ...valid, role: "admin" }).value).not.toBeNull();
  });

  it("rejects non-string input rather than coercing it", () => {
    const { value } = validateNewUser({
      email: 42,
      name: { toString: () => "Priya" },
      password: undefined,
      role: "student",
    });
    expect(value).toBeNull();
  });
});
