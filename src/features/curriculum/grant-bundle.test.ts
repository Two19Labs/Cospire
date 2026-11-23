import { beforeEach, describe, expect, it, vi } from "vitest";

// The End-to-End enrolment action (D62) against a stand-in client. What is
// pinned here is the shape of the write: both grants in ONE statement (which
// is what makes them land together), no write at all for a non-admin or a
// wrong pairing, and a database refusal reported as nothing changed. The real
// policies and the real atomicity are probed in `scripts/verify/bundle.sql`.

const admin = { id: "a0000000-0000-4000-8000-000000000001", orgId: 1 };
const student = "b0000000-0000-4000-8000-000000000002";

const state = vi.hoisted(() => ({
  courses: [] as { id: number; kind: string }[],
  upserts: [] as { options: unknown; rows: unknown }[],
  upsertError: null as { code: string } | null,
}));
const requireRole = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/features/auth/guards", () => ({ requireRole }));
vi.mock("@/shared/db/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: (table: string) =>
      table === "courses"
        ? { select: () => ({ in: async () => ({ data: state.courses, error: null }) }) }
        : {
            upsert: async (rows: unknown, options: unknown) => {
              state.upserts.push({ options, rows });
              return { error: state.upsertError };
            },
          },
  }),
}));

const { grantBundleAction } = await import("./actions/set-course-access");

function post(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return grantBundleAction(form).then(
    () => "returned",
    (error: Error) => error.message,
  );
}

const valid = { courseId: "10", processId: "20", studentId: student };

beforeEach(() => {
  state.courses = [
    { id: 10, kind: "programme" },
    { id: 20, kind: "ars_process" },
  ];
  state.upserts = [];
  state.upsertError = null;
  requireRole.mockReset().mockResolvedValue(admin);
});

describe("grantBundleAction", () => {
  it("writes both course grants in one statement and reports success", async () => {
    expect(await post(valid)).toBe("REDIRECT /admin/courses/10?notice=bundle-granted");
    expect(state.upserts).toHaveLength(1);
    const grant = { granted_by: admin.id, org_id: 1, resource_type: "course", student_id: student };
    expect(state.upserts[0].rows).toEqual([
      { ...grant, resource_id: 10 },
      { ...grant, resource_id: 20 },
    ]);
    // DO NOTHING on a grant already held: an UPDATE would be refused (42501).
    expect(state.upserts[0].options).toEqual({
      ignoreDuplicates: true,
      onConflict: "student_id,resource_type,resource_id",
    });
  });

  it("writes nothing for a caller who is not an admin", async () => {
    requireRole.mockRejectedValue(new Error("REDIRECT /student"));
    expect(await post(valid)).toBe("REDIRECT /student");
    expect(requireRole).toHaveBeenCalledWith("admin");
    expect(state.upserts).toHaveLength(0);
  });

  it("refuses two programmes, a missing process and a bad student id", async () => {
    state.courses = [
      { id: 10, kind: "programme" },
      { id: 20, kind: "programme" },
    ];
    expect(await post(valid)).toBe("REDIRECT /admin/courses/10?error=invalid-request");
    state.courses = [{ id: 10, kind: "programme" }];
    expect(await post(valid)).toBe("REDIRECT /admin/courses/10?error=invalid-request");
    expect(await post({ ...valid, studentId: "nope" })).toBe(
      "REDIRECT /admin/courses/10?error=invalid-request",
    );
    expect(state.upserts).toHaveLength(0);
  });

  it("reports a database refusal as a failed change", async () => {
    state.upsertError = { code: "23514" };
    expect(await post(valid)).toBe("REDIRECT /admin/courses/10?error=access-change-failed");
  });
});
