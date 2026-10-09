import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback } from "./harness";
import { addMember, foundSchool, seedClassroom } from "./fixtures";

beforeAll(connect);
afterAll(disconnect);

/**
 * Leaving without being deleted. A dropped enrollment and an inactive
 * membership keep their rows for the record, so every access check has to
 * look at status, not merely at whether a row exists.
 */

describe("a dropped student", () => {
  it("loses the section, its items and the right to record progress", async () => {
    await withRollback(async (db) => {
      const { student, sectionId, itemIds } = await seedClassroom(db);

      const before = await db.asUser(student, (q) =>
        q.run("select id from public.sections where id = $1", [sectionId]),
      );
      expect(before).toHaveLength(1);

      await db.seed(
        "update public.section_enrollments set status = 'dropped' where section_id = $1 and profile_id = $2",
        [sectionId, student],
      );

      const section = await db.asUser(student, (q) =>
        q.run("select id from public.sections where id = $1", [sectionId]),
      );
      expect(section).toHaveLength(0);

      const items = await db.asUser(student, (q) =>
        q.run("select id from public.module_items where id = any($1)", [itemIds]),
      );
      expect(items).toHaveLength(0);

      const catalog = await db.asUser(student, (q) =>
        q.run("select id from public.module_item_catalog where section_id = $1", [sectionId]),
      );
      expect(catalog).toHaveLength(0);

      const progress = await db.asUser(student, (q) =>
        q.attempt(
          "insert into public.module_item_progress (item_id, student_id) values ($1, $2)",
          [itemIds[0], student],
        ),
      );
      expect(progress.ok).toBe(false);
    });
  });

  it("disappears from the roster their teacher sees as active, but is not erased", async () => {
    await withRollback(async (db) => {
      const { teacher, student, sectionId } = await seedClassroom(db);
      await db.seed(
        "update public.section_enrollments set status = 'dropped' where section_id = $1 and profile_id = $2",
        [sectionId, student],
      );
      const rows = await db.asUser(teacher, (q) =>
        q.run<{ status: string }>(
          "select status from public.section_enrollments where section_id = $1 and profile_id = $2",
          [sectionId, student],
        ),
      );
      expect(rows).toEqual([{ status: "dropped" }]);
    });
  });

  it("no longer counts as staffed by their former teacher", async () => {
    await withRollback(async (db) => {
      const { teacher, student, sectionId } = await seedClassroom(db);
      await db.seed(
        "update public.section_enrollments set status = 'dropped' where section_id = $1 and profile_id = $2",
        [sectionId, student],
      );
      const [row] = await db.asUser(teacher, (q) =>
        q.run<{ staffs_student: boolean }>("select public.staffs_student($1)", [student]),
      );
      expect(row.staffs_student).toBe(false);
    });
  });
});

describe("a teacher whose enrollment is dropped", () => {
  it("can no longer manage or even see the section", async () => {
    await withRollback(async (db) => {
      const { teacher, sectionId, moduleId } = await seedClassroom(db);
      await db.seed(
        "update public.section_enrollments set status = 'dropped' where section_id = $1 and profile_id = $2",
        [sectionId, teacher],
      );
      const [manage] = await db.asUser(teacher, (q) =>
        q.run<{ can_manage_section: boolean }>("select public.can_manage_section($1)", [sectionId]),
      );
      expect(manage.can_manage_section).toBe(false);
      const edited = await db.asUser(teacher, (q) =>
        q.run("update public.modules set title = 'x' where id = $1 returning id", [moduleId]),
      );
      expect(edited).toHaveLength(0);
      const visible = await db.asUser(teacher, (q) =>
        q.run("select id from public.sections where id = $1", [sectionId]),
      );
      expect(visible).toHaveLength(0);
    });
  });
});

describe("an inactive membership", () => {
  it("removes a person from the school without deleting their record", async () => {
    await withRollback(async (db) => {
      const { teacher, schoolId, courseId } = await seedClassroom(db);
      await db.seed(
        "update public.memberships set status = 'inactive' where school_id = $1 and profile_id = $2",
        [schoolId, teacher],
      );

      const [member] = await db.asUser(teacher, (q) =>
        q.run<{ is_school_member: boolean }>("select public.is_school_member($1)", [schoolId]),
      );
      expect(member.is_school_member).toBe(false);

      const courses = await db.asUser(teacher, (q) =>
        q.run("select id from public.courses where id = $1", [courseId]),
      );
      expect(courses).toHaveLength(0);

      const school = await db.asUser(teacher, (q) =>
        q.run("select id from public.schools where id = $1", [schoolId]),
      );
      expect(school).toHaveLength(0);

      const kept = await db.seed(
        "select status from public.memberships where school_id = $1 and profile_id = $2",
        [schoolId, teacher],
      );
      expect(kept).toEqual([{ status: "inactive" }]);
    });
  });

  it("blocks enrolling the person into a section", async () => {
    await withRollback(async (db) => {
      const { admin, schoolId, sectionId } = await seedClassroom(db);
      const former = await db.createUser({ email: "former@s1.test" });
      await addMember(db, schoolId, former, "student");
      await db.seed(
        "update public.memberships set status = 'inactive' where school_id = $1 and profile_id = $2",
        [schoolId, former],
      );
      const result = await db.asUser(admin, (q) =>
        q.attempt(
          "insert into public.section_enrollments (section_id, profile_id, role) values ($1, $2, 'student')",
          [sectionId, former],
        ),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not an active student/i);
    });
  });

  it("strips an inactive admin of their powers", async () => {
    await withRollback(async (db) => {
      const { schoolId, termId } = await seedClassroom(db);
      const principal = await db.createUser({ email: "principal@s1.test" });
      await addMember(db, schoolId, principal, "school_admin");
      await db.seed(
        "update public.memberships set status = 'inactive' where school_id = $1 and profile_id = $2",
        [schoolId, principal],
      );
      const [row] = await db.asUser(principal, (q) =>
        q.run<{ is_school_admin: boolean }>("select public.is_school_admin($1)", [schoolId]),
      );
      expect(row.is_school_admin).toBe(false);
      const edited = await db.asUser(principal, (q) =>
        q.run("update public.terms set name = 'x' where id = $1 returning id", [termId]),
      );
      expect(edited).toHaveLength(0);
    });
  });

  it("is reactivated by accepting a fresh invitation", async () => {
    await withRollback(async (db) => {
      const { admin, schoolId } = await seedClassroom(db);
      const returning = await db.createUser({ email: "back@s1.test" });
      await addMember(db, schoolId, returning, "teacher");
      await db.seed(
        "update public.memberships set status = 'inactive' where school_id = $1 and profile_id = $2",
        [schoolId, returning],
      );

      const [invite] = await db.asUser(admin, (q) =>
        q.run<{ token: string }>(
          "insert into public.invitations (school_id, email, role) values ($1, 'back@s1.test', 'teacher') returning token",
          [schoolId],
        ),
      );
      await db.asUser(returning, (q) => q.run("select public.accept_invitation($1)", [invite.token]));

      const rows = await db.seed<{ status: string }>(
        "select status from public.memberships where school_id = $1 and profile_id = $2",
        [schoolId, returning],
      );
      expect(rows).toEqual([{ status: "active" }]);
    });
  });
});

describe("a person at two schools", () => {
  it("has each school's role only at that school", async () => {
    await withRollback(async (db) => {
      const founderA = await db.createUser({ email: "a@founders.test" });
      const founderB = await db.createUser({ email: "b@founders.test" });
      const a = await foundSchool(db, founderA, "School A");
      const b = await foundSchool(db, founderB, "School B");
      const person = await db.createUser({ email: "both@schools.test" });
      await addMember(db, a.schoolId, person, "teacher");
      await addMember(db, b.schoolId, person, "student");

      const [atA] = await db.asUser(person, (q) =>
        q.run<{ t: boolean; s: boolean }>(
          "select public.has_school_role($1, '{teacher}') as t, public.has_school_role($1, '{student}') as s",
          [a.schoolId],
        ),
      );
      expect(atA).toEqual({ t: true, s: false });
      const [atB] = await db.asUser(person, (q) =>
        q.run<{ t: boolean; s: boolean }>(
          "select public.has_school_role($1, '{teacher}') as t, public.has_school_role($1, '{student}') as s",
          [b.schoolId],
        ),
      );
      expect(atB).toEqual({ t: false, s: true });
    });
  });
});

describe("signup", () => {
  it("copies the name from signup metadata into the profile, and tolerates its absence", async () => {
    await withRollback(async (db) => {
      const named = await db.createUser({ email: "named@x.test", fullName: "Ada Lovelace" });
      const anonymous = await db.createUser({ email: "blank@x.test" });
      const rows = await db.seed<{ id: string; full_name: string; onboarded: boolean }>(
        "select id, full_name, onboarded from public.profiles where id = any($1) order by full_name",
        [[named, anonymous]],
      );
      expect(rows).toEqual([
        { id: anonymous, full_name: "", onboarded: false },
        { id: named, full_name: "Ada Lovelace", onboarded: false },
      ]);
    });
  });

  it("removes the profile and everything hanging off it when the auth user goes", async () => {
    await withRollback(async (db) => {
      const { student, sectionId } = await seedClassroom(db);
      await db.seed("delete from auth.users where id = $1", [student]);
      const profile = await db.seed("select 1 from public.profiles where id = $1", [student]);
      expect(profile).toHaveLength(0);
      const enrollment = await db.seed(
        "select 1 from public.section_enrollments where section_id = $1 and profile_id = $2",
        [sectionId, student],
      );
      expect(enrollment).toHaveLength(0);
    });
  });
});
