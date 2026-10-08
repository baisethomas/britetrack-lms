import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback } from "./harness";
import {
  addMember,
  enrollStudent,
  foundSchool,
  linkGuardian,
  seedClassroom,
  seedCourse,
  seedSection,
} from "./fixtures";

beforeAll(connect);
afterAll(disconnect);

describe("creating sections", () => {
  it("enrols a teacher as the teacher of the section they create", async () => {
    await withRollback(async (db) => {
      const { teacher, courseId, termId } = await seedClassroom(db);
      const [row] = await db.asUser(teacher, (q) =>
        q.run<{ create_section: string }>(
          "select public.create_section($1, $2, 'Period 2')",
          [courseId, termId],
        ),
      );
      const [role] = await db.asUser(teacher, (q) =>
        q.run<{ section_role: string }>("select public.section_role($1)", [
          row.create_section,
        ]),
      );
      expect(role.section_role).toBe("teacher");
    });
  });

  it("lets an admin create a section without enrolling themselves", async () => {
    await withRollback(async (db) => {
      const { admin, courseId, termId } = await seedClassroom(db);
      const [row] = await db.asUser(admin, (q) =>
        q.run<{ create_section: string }>(
          "select public.create_section($1, $2, 'Period 2')",
          [courseId, termId],
        ),
      );
      const enrolments = await db.seed(
        "select 1 from public.section_enrollments where section_id = $1",
        [row.create_section],
      );
      expect(enrolments).toHaveLength(0);
    });
  });

  it("refuses a student, and a teacher from another school", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });
      for (const who of [a.student, b.teacher]) {
        const result = await db.asUser(who, (q) =>
          q.attempt("select public.create_section($1, $2, 'Rogue')", [a.courseId, a.termId]),
        );
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/forbidden/i);
      }
    });
  });

  it("refuses a term from a different school", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });
      const result = await db.asUser(a.admin, (q) =>
        q.attempt("select public.create_section($1, $2, 'Mixed')", [a.courseId, b.termId]),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/different school/i);
    });
  });
});

describe("a teacher's reach", () => {
  it("is their own sections, not a colleague's at the same school", async () => {
    // The property that distinguishes a school from a course platform.
    await withRollback(async (db) => {
      const { teacher, schoolId, courseId, termId, sectionId, student } =
        await seedClassroom(db);
      const colleague = await db.createUser({ email: "colleague@s1.test" });
      await addMember(db, schoolId, colleague, "teacher");
      const theirs = await seedSection(db, {
        courseId,
        termId,
        teacherId: colleague,
        name: "Period 5",
      });
      const theirStudent = await db.createUser({ email: "kid2@s1.test" });
      await addMember(db, schoolId, theirStudent, "student");
      await enrollStudent(db, theirs, theirStudent);

      const sections = await db.asUser(teacher, (q) =>
        q.run<{ id: string }>("select id from public.sections"),
      );
      expect(sections.map((s) => s.id)).toEqual([sectionId]);

      const roster = await db.asUser(teacher, (q) =>
        q.run<{ profile_id: string }>(
          "select profile_id from public.section_enrollments where role = 'student'",
        ),
      );
      expect(roster.map((r) => r.profile_id)).toEqual([student]);

      // Nor the other roster's student records or names.
      const records = await db.asUser(teacher, (q) =>
        q.run<{ profile_id: string }>("select profile_id from public.students"),
      );
      expect(records.map((r) => r.profile_id)).toEqual([student]);
      const names = await db.asUser(teacher, (q) =>
        q.run<{ id: string }>("select id from public.profiles where id = $1", [theirStudent]),
      );
      expect(names).toHaveLength(0);
    });
  });

  it("includes rostering students into their own section but not a colleague's", async () => {
    await withRollback(async (db) => {
      const { teacher, schoolId, courseId, termId, sectionId } = await seedClassroom(db);
      const colleague = await db.createUser({ email: "colleague@s1.test" });
      await addMember(db, schoolId, colleague, "teacher");
      const theirs = await seedSection(db, { courseId, termId, teacherId: colleague });
      const newKid = await db.createUser({ email: "kid2@s1.test" });
      await addMember(db, schoolId, newKid, "student");

      const mine = await db.asUser(teacher, (q) =>
        q.run<{ id: string }>(
          `insert into public.section_enrollments (section_id, profile_id, role)
           values ($1, $2, 'student') returning id`,
          [sectionId, newKid],
        ),
      );
      expect(mine).toHaveLength(1);

      const intoTheirs = await db.asUser(teacher, (q) =>
        q.attempt(
          `insert into public.section_enrollments (section_id, profile_id, role)
           values ($1, $2, 'student') returning id`,
          [theirs, newKid],
        ),
      );
      expect(intoTheirs.ok && intoTheirs.rows.length > 0).toBe(false);
    });
  });

  it("does not extend to assigning staff roles", async () => {
    await withRollback(async (db) => {
      const { teacher, admin, schoolId, sectionId } = await seedClassroom(db);
      const helper = await db.createUser({ email: "aide@s1.test" });
      await addMember(db, schoolId, helper, "teacher");

      const byTeacher = await db.asUser(teacher, (q) =>
        q.attempt(
          `insert into public.section_enrollments (section_id, profile_id, role)
           values ($1, $2, 'co_teacher') returning id`,
          [sectionId, helper],
        ),
      );
      expect(byTeacher.ok && byTeacher.rows.length > 0).toBe(false);

      const byAdmin = await db.asUser(admin, (q) =>
        q.run<{ id: string }>(
          `insert into public.section_enrollments (section_id, profile_id, role)
           values ($1, $2, 'co_teacher') returning id`,
          [sectionId, helper],
        ),
      );
      expect(byAdmin).toHaveLength(1);
    });
  });
});

describe("enrollment integrity", () => {
  it("refuses to enrol someone who is not a member of the school", async () => {
    await withRollback(async (db) => {
      const { admin, sectionId } = await seedClassroom(db);
      const stranger = await db.createUser({ email: "stranger@example.com" });
      const result = await db.asUser(admin, (q) =>
        q.attempt(
          `insert into public.section_enrollments (section_id, profile_id, role)
           values ($1, $2, 'student') returning id`,
          [sectionId, stranger],
        ),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not an active student/i);
    });
  });

  it("refuses to enrol a teacher as a student or a student as a teacher", async () => {
    await withRollback(async (db) => {
      const { admin, sectionId, teacher, student, courseId, termId } = await seedClassroom(db);
      const second = await seedSection(db, { courseId, termId, name: "Period 2" });

      const teacherAsStudent = await db.asUser(admin, (q) =>
        q.attempt(
          `insert into public.section_enrollments (section_id, profile_id, role)
           values ($1, $2, 'student') returning id`,
          [second, teacher],
        ),
      );
      expect(teacherAsStudent.ok).toBe(false);

      const studentAsTeacher = await db.asUser(admin, (q) =>
        q.attempt(
          `insert into public.section_enrollments (section_id, profile_id, role)
           values ($1, $2, 'teacher') returning id`,
          [second, student],
        ),
      );
      expect(studentAsTeacher.ok).toBe(false);
      void sectionId;
    });
  });

  it("stops a student from enrolling themselves or anyone else", async () => {
    await withRollback(async (db) => {
      const { student, courseId, termId } = await seedClassroom(db);
      const second = await seedSection(db, { courseId, termId, name: "Period 2" });
      const result = await db.asUser(student, (q) =>
        q.attempt(
          `insert into public.section_enrollments (section_id, profile_id, role)
           values ($1, $2, 'student') returning id`,
          [second, student],
        ),
      );
      expect(result.ok && result.rows.length > 0).toBe(false);
    });
  });

  it("derives school_id from the section rather than trusting the caller", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });
      const kid = await db.createUser({ email: "kid2@a.test" });
      await addMember(db, a.schoolId, kid, "student");

      const [row] = await db.asUser(a.admin, (q) =>
        q.run<{ school_id: string }>(
          `insert into public.section_enrollments (school_id, section_id, profile_id, role)
           values ($1, $2, $3, 'student') returning school_id`,
          [b.schoolId, a.sectionId, kid],
        ),
      );
      expect(row.school_id).toBe(a.schoolId);
    });
  });
});

describe("who can see a section", () => {
  it("its students, its staff, the school's admins, and the students' guardians", async () => {
    await withRollback(async (db) => {
      const { admin, teacher, student, sectionId, schoolId } = await seedClassroom(db);
      const guardian = await db.createUser({ email: "guardian@s1.test" });
      await addMember(db, schoolId, guardian, "guardian");
      await linkGuardian(db, guardian, student);

      for (const who of [admin, teacher, student, guardian]) {
        const seen = await db.asUser(who, (q) =>
          q.run<{ id: string }>("select id from public.sections where id = $1", [sectionId]),
        );
        expect(seen).toHaveLength(1);
      }
    });
  });

  it("not a guardian with no child in it, nor a student in another section", async () => {
    await withRollback(async (db) => {
      const { sectionId, schoolId, courseId, termId } = await seedClassroom(db);
      const guardian = await db.createUser({ email: "guardian@s1.test" });
      await addMember(db, schoolId, guardian, "guardian");
      const other = await db.createUser({ email: "other@s1.test" });
      await addMember(db, schoolId, other, "student");
      const second = await seedSection(db, { courseId, termId, name: "Period 2" });
      await enrollStudent(db, second, other);

      for (const who of [guardian, other]) {
        const seen = await db.asUser(who, (q) =>
          q.run<{ id: string }>("select id from public.sections where id = $1", [sectionId]),
        );
        expect(seen).toHaveLength(0);
      }
    });
  });

  it("is unaffected by founding a second school with the same course title", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const other = await db.createUser({ email: "founder@b.test" });
      const b = await foundSchool(db, other, "School b");
      const course = await seedCourse(db, b.schoolId, { title: "Algebra I" });
      await seedSection(db, { courseId: course, termId: b.termId });

      const seen = await db.asUser(a.student, (q) =>
        q.run<{ id: string }>("select id from public.sections"),
      );
      expect(seen.map((s) => s.id)).toEqual([a.sectionId]);
    });
  });
});
