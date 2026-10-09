import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, formData } from "../helpers/supabase-mock";

/**
 * Administrative actions: the form validation and payload shaping in front
 * of the database. RLS decides who may do what (tests/db); this decides what
 * a badly filled form is told.
 */

const state = vi.hoisted(() => ({
  supabase: null as ReturnType<typeof fakeSupabase> | null,
  ctx: {
    profile: { id: "admin-1" },
    school: { id: "school-1" },
    isAdmin: true,
    isTeacher: false,
    isStudent: false,
    isGuardian: false,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => state.supabase),
}));
vi.mock("@/lib/data", () => ({
  requireSchool: vi.fn(async () => state.ctx),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

const { createCourse, createTerm, invitePerson, rosterByEmail, setGradeLevel } =
  await import("@/lib/actions/school");

const STUDENT = "33333333-3333-4333-8333-333333333333";
const SECTION = "44444444-4444-4444-8444-444444444444";
const prev = { error: null };

beforeEach(() => {
  state.ctx.isAdmin = true;
  state.ctx.isTeacher = false;
  state.supabase = fakeSupabase();
});

describe("invitePerson", () => {
  it("stores the email lower-cased and hands back the join link", async () => {
    state.supabase = fakeSupabase({ tables: { invitations: { data: { token: "tok123" }, error: null } } });
    const result = await invitePerson(prev, formData({ email: "  Jo@Example.COM ", role: "teacher" }));
    expect(result).toEqual({
      error: null,
      success: "Invitation created for Jo@Example.COM",
      payload: "/join/tok123",
    });
    expect(state.supabase.callsTo("invitations")[0]).toEqual([
      "insert",
      {
        school_id: "school-1",
        email: "jo@example.com",
        role: "teacher",
        grade_level: null,
        student_id: null,
        invited_by: "admin-1",
      },
    ]);
  });

  it("requires a grade for a student and a student for a guardian", async () => {
    const student = await invitePerson(prev, formData({ email: "s@x.test", role: "student" }));
    expect(student.error).toMatch(/grade/i);
    const guardian = await invitePerson(prev, formData({ email: "g@x.test", role: "guardian" }));
    expect(guardian.error).toMatch(/student/i);
    expect(state.supabase!.from).not.toHaveBeenCalled();
  });

  it("passes the grade and the linked student through", async () => {
    state.supabase = fakeSupabase({ tables: { invitations: { data: { token: "t" }, error: null } } });
    await invitePerson(prev, formData({ email: "s@x.test", role: "student", grade_level: "0" }));
    expect(state.supabase.callsTo("invitations")[0][1]).toMatchObject({ grade_level: 0 });

    state.supabase = fakeSupabase({ tables: { invitations: { data: { token: "t" }, error: null } } });
    await invitePerson(prev, formData({ email: "g@x.test", role: "guardian", student_id: STUDENT }));
    expect(state.supabase.callsTo("invitations")[0][1]).toMatchObject({ student_id: STUDENT });
  });

  it("rejects a bad email, an unknown role and an out-of-range grade", async () => {
    expect((await invitePerson(prev, formData({ email: "nope", role: "teacher" }))).error).toMatch(/email/i);
    expect((await invitePerson(prev, formData({ email: "a@b.test", role: "principal" }))).error).toBeTruthy();
    expect(
      (await invitePerson(prev, formData({ email: "a@b.test", role: "student", grade_level: "13" }))).error,
    ).toBeTruthy();
    expect(state.supabase!.from).not.toHaveBeenCalled();
  });

  it("sends a non-admin back to the dashboard", async () => {
    state.ctx.isAdmin = false;
    await expect(invitePerson(prev, formData({ email: "a@b.test", role: "teacher" }))).rejects.toThrow(
      "REDIRECT /dashboard",
    );
  });
});

describe("createTerm", () => {
  it("adds a term to the active school", async () => {
    const result = await createTerm(
      prev,
      formData({ name: " Fall ", starts_on: "2026-08-20", ends_on: "2026-12-18" }),
    );
    expect(result).toEqual({ error: null, success: "Fall added" });
    expect(state.supabase!.callsTo("terms")[0]).toEqual([
      "insert",
      { name: "Fall", starts_on: "2026-08-20", ends_on: "2026-12-18", school_id: "school-1" },
    ]);
  });

  it("refuses a term that ends before it starts, or on the same day", async () => {
    for (const ends_on of ["2026-08-01", "2026-08-20"]) {
      const result = await createTerm(prev, formData({ name: "Fall", starts_on: "2026-08-20", ends_on }));
      expect(result.error).toMatch(/end after it starts/i);
    }
    expect(state.supabase!.from).not.toHaveBeenCalled();
  });

  it("requires a name and both dates", async () => {
    expect((await createTerm(prev, formData({ name: "", starts_on: "2026-08-20", ends_on: "2026-12-18" }))).error).toMatch(/name/i);
    expect((await createTerm(prev, formData({ name: "Fall", starts_on: "", ends_on: "2026-12-18" }))).error).toMatch(/start/i);
    expect((await createTerm(prev, formData({ name: "Fall", starts_on: "2026-08-20", ends_on: "" }))).error).toMatch(/end/i);
  });
});

describe("createCourse", () => {
  it("creates an admin's course as a draft and opens it", async () => {
    state.supabase = fakeSupabase({ tables: { courses: { data: { id: "course-1" }, error: null } } });
    await expect(
      createCourse(prev, formData({ title: " Algebra I ", subject: "", grade_levels: ["8", "9"], credits: "1" })),
    ).rejects.toThrow("REDIRECT /admin/courses/course-1");
    expect(state.supabase.callsTo("courses")[0]).toEqual([
      "insert",
      {
        school_id: "school-1",
        title: "Algebra I",
        description: "",
        subject: null,
        grade_levels: [8, 9],
        credits: 1,
        created_by: "admin-1",
        status: "draft",
      },
    ]);
  });

  it("publishes a teacher's own course straight away, with no credit value when left blank", async () => {
    state.ctx.isAdmin = false;
    state.ctx.isTeacher = true;
    state.supabase = fakeSupabase({ tables: { courses: { data: { id: "c" }, error: null } } });
    await expect(createCourse(prev, formData({ title: "Art", credits: "" }))).rejects.toThrow("REDIRECT");
    expect(state.supabase.callsTo("courses")[0][1]).toMatchObject({
      status: "published",
      credits: null,
      grade_levels: [],
    });
  });

  it("turns away someone who is neither admin nor teacher", async () => {
    state.ctx.isAdmin = false;
    await expect(createCourse(prev, formData({ title: "Art" }))).rejects.toThrow("REDIRECT /dashboard");
  });

  it("refuses a missing title and a grade outside pre-K to 12", async () => {
    expect((await createCourse(prev, formData({ title: "  " }))).error).toMatch(/title/i);
    expect((await createCourse(prev, formData({ title: "X", grade_levels: ["14"] }))).error).toBeTruthy();
    expect((await createCourse(prev, formData({ title: "X", grade_levels: ["-2"] }))).error).toBeTruthy();
  });
});

describe("rosterByEmail", () => {
  it("looks up the pasted emails at the active school and enrols the matches", async () => {
    state.supabase = fakeSupabase({
      rpcResult: { data: [{ id: "p1", email: "a@x.test" }, { id: "p2", email: "b@x.test" }], error: null },
    });
    const result = await rosterByEmail(SECTION, prev, formData({ emails: "A@x.test\nb@x.test, c@x.test" }));
    expect(state.supabase.rpc).toHaveBeenCalledWith("find_school_students_by_email", {
      p_school: "school-1",
      p_emails: ["a@x.test", "b@x.test", "c@x.test"],
    });
    expect(state.supabase.callsTo("section_enrollments")[0]).toEqual([
      "upsert",
      [
        { section_id: SECTION, profile_id: "p1", role: "student" },
        { section_id: SECTION, profile_id: "p2", role: "student" },
      ],
      { onConflict: "section_id,profile_id", ignoreDuplicates: true },
    ]);
    expect(result).toEqual({ error: null, success: "Added 2 students — not found: c@x.test" });
  });

  it("uses the singular for one student and no suffix when everyone matched", async () => {
    state.supabase = fakeSupabase({ rpcResult: { data: [{ id: "p1", email: "a@x.test" }], error: null } });
    const result = await rosterByEmail(SECTION, prev, formData({ emails: "a@x.test" }));
    expect(result.success).toBe("Added 1 student");
  });

  it("explains an empty box, a box with no addresses, and no matches", async () => {
    expect((await rosterByEmail(SECTION, prev, formData({ emails: "  " }))).error).toMatch(/at least one/i);
    expect((await rosterByEmail(SECTION, prev, formData({ emails: "nobody, here" }))).error).toMatch(/no valid/i);
    state.supabase = fakeSupabase({ rpcResult: { data: [], error: null } });
    expect((await rosterByEmail(SECTION, prev, formData({ emails: "z@x.test" }))).error).toMatch(/none of those/i);
  });
});

describe("setGradeLevel", () => {
  it("stores a grade within range and ignores one outside it", async () => {
    await setGradeLevel(STUDENT, formData({ grade_level: "-1" }));
    expect(state.supabase!.callsTo("students")[0]).toEqual(["update", { grade_level: -1 }]);

    state.supabase = fakeSupabase();
    await setGradeLevel(STUDENT, formData({ grade_level: "13" }));
    expect(state.supabase.from).not.toHaveBeenCalled();
  });
});
