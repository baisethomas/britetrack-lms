import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback } from "./harness";
import { addMember, foundSchool, seedClassroom, seedCourse } from "./fixtures";

beforeAll(connect);
afterAll(disconnect);

describe("founding a school", () => {
  it("makes the founder the school's admin and the organisation's admin", async () => {
    await withRollback(async (db) => {
      const founder = await db.createUser({ email: "f@example.com" });
      const { schoolId, orgId } = await foundSchool(db, founder, "Hillside Elementary");

      const roles = await db.asUser(founder, (q) =>
        q.run<{ role: string }>("select role from public.memberships where school_id = $1", [
          schoolId,
        ]),
      );
      expect(roles.map((r) => r.role)).toEqual(["school_admin"]);

      const orgRoles = await db.asUser(founder, (q) =>
        q.run<{ role: string }>(
          "select role from public.organization_memberships where organization_id = $1",
          [orgId],
        ),
      );
      expect(orgRoles.map((r) => r.role)).toEqual(["org_admin"]);

      const [profile] = await db.asUser(founder, (q) =>
        q.run<{ onboarded: boolean }>("select onboarded from public.profiles where id = $1", [
          founder,
        ]),
      );
      expect(profile.onboarded).toBe(true);
    });
  });

  it("refuses an anonymous caller", async () => {
    await withRollback(async (db) => {
      const result = await db.asAnon((q) =>
        q.attempt("select public.create_school('Nowhere High')"),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not authenticated/i);
    });
  });

  it("ignores any role supplied in signup metadata", async () => {
    // Roles are earned through invitations or founding a school, never
    // claimed by the client at signup.
    await withRollback(async (db) => {
      const user = await db.createUser({ email: "x@example.com", role: "school_admin" });
      const rows = await db.seed("select 1 from public.memberships where profile_id = $1", [
        user,
      ]);
      expect(rows).toHaveLength(0);
    });
  });
});

describe("tenant isolation", () => {
  it("keeps one school's admin out of another school entirely", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });

      const schools = await db.asUser(a.admin, (q) =>
        q.run<{ id: string }>("select id from public.schools"),
      );
      expect(schools.map((s) => s.id)).toEqual([a.schoolId]);

      const courses = await db.asUser(a.admin, (q) =>
        q.run<{ id: string }>("select id from public.courses"),
      );
      expect(courses.map((c) => c.id)).toEqual([a.courseId]);

      const sections = await db.asUser(a.admin, (q) =>
        q.run<{ id: string }>("select id from public.sections"),
      );
      expect(sections.map((s) => s.id)).toEqual([a.sectionId]);

      const members = await db.asUser(a.admin, (q) =>
        q.run<{ school_id: string }>("select distinct school_id from public.memberships"),
      );
      expect(members.map((m) => m.school_id)).toEqual([a.schoolId]);

      const students = await db.asUser(a.admin, (q) =>
        q.run<{ profile_id: string }>("select profile_id from public.students"),
      );
      expect(students.map((s) => s.profile_id)).not.toContain(b.student);
    });
  });

  it("refuses the people directory of a school you do not administer", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });

      const own = await db.asUser(a.admin, (q) =>
        q.run<{ id: string; email: string }>("select id, email from public.school_people($1)", [
          a.schoolId,
        ]),
      );
      expect(own.map((p) => p.id).sort()).toEqual([a.admin, a.student, a.teacher].sort());

      const other = await db.asUser(a.admin, (q) =>
        q.attempt("select * from public.school_people($1)", [b.schoolId]),
      );
      expect(other.ok).toBe(false);
      expect(other.error).toMatch(/forbidden/i);

      const asTeacher = await db.asUser(a.teacher, (q) =>
        q.attempt("select * from public.school_people($1)", [a.schoolId]),
      );
      expect(asTeacher.ok).toBe(false);
    });
  });

  it("stops a member from granting themselves a role anywhere", async () => {
    await withRollback(async (db) => {
      const { student, schoolId } = await seedClassroom(db);
      const b = await seedClassroom(db, { tag: "b" });

      for (const target of [schoolId, b.schoolId]) {
        const result = await db.asUser(student, (q) =>
          q.attempt(
            `insert into public.memberships (school_id, profile_id, role)
             values ($1, $2, 'school_admin') returning id`,
            [target, student],
          ),
        );
        expect(result.ok && result.rows.length > 0).toBe(false);
      }
    });
  });

  it("lets a district admin see and extend every school in the organisation", async () => {
    await withRollback(async (db) => {
      const { admin, orgId, schoolId } = await seedClassroom(db);

      const [second] = await db.asUser(admin, (q) =>
        q.run<{ id: string }>(
          `insert into public.schools (organization_id, name) values ($1, 'Second Campus')
           returning id`,
          [orgId],
        ),
      );
      const visible = await db.asUser(admin, (q) =>
        q.run<{ id: string }>("select id from public.schools order by created_at"),
      );
      expect(visible.map((s) => s.id)).toEqual([schoolId, second.id]);

      // Org admin status reaches into the new school without a membership there.
      const [course] = await db.asUser(admin, (q) =>
        q.run<{ id: string }>(
          `insert into public.courses (school_id, title) values ($1, 'Reading')
           returning id`,
          [second.id],
        ),
      );
      expect(course.id).toBeTruthy();
    });
  });

  it("stops a school admin from adding schools to an organisation they do not run", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });
      const result = await db.asUser(a.admin, (q) =>
        q.attempt(
          "insert into public.schools (organization_id, name) values ($1, 'Rogue') returning id",
          [b.orgId],
        ),
      );
      expect(result.ok && result.rows.length > 0).toBe(false);
    });
  });
});

describe("invitations", () => {
  async function invite(
    db: Awaited<Parameters<Parameters<typeof withRollback>[0]>[0]>,
    admin: string,
    schoolId: string,
    email: string,
    role: string,
    extra: { gradeLevel?: number; studentId?: string } = {},
  ): Promise<string> {
    const [row] = await db.asUser(admin, (q) =>
      q.run<{ token: string }>(
        `insert into public.invitations (school_id, email, role, grade_level, student_id)
         values ($1, $2, $3, $4, $5) returning token`,
        [schoolId, email, role, extra.gradeLevel ?? null, extra.studentId ?? null],
      ),
    );
    return row.token;
  }

  it("lets the invited email accept and become a member", async () => {
    await withRollback(async (db) => {
      const { admin, schoolId } = await seedClassroom(db);
      const token = await invite(db, admin, schoolId, "New.Teacher@Example.com", "teacher");

      const newcomer = await db.createUser({ email: "new.teacher@example.com" });
      const [accepted] = await db.asUser(newcomer, (q) =>
        q.run<{ accept_invitation: string }>("select public.accept_invitation($1)", [token]),
      );
      expect(accepted.accept_invitation).toBe(schoolId);

      const roles = await db.asUser(newcomer, (q) =>
        q.run<{ role: string }>("select role from public.memberships where school_id = $1", [
          schoolId,
        ]),
      );
      expect(roles.map((r) => r.role)).toEqual(["teacher"]);
    });
  });

  it("creates the student record with its grade on a student invite", async () => {
    await withRollback(async (db) => {
      const { admin, schoolId } = await seedClassroom(db);
      const token = await invite(db, admin, schoolId, "kid@example.com", "student", {
        gradeLevel: 3,
      });
      const kid = await db.createUser({ email: "kid@example.com" });
      await db.asUser(kid, (q) => q.run("select public.accept_invitation($1)", [token]));

      const [record] = await db.asUser(kid, (q) =>
        q.run<{ grade_level: number; school_id: string }>(
          "select grade_level, school_id from public.students where profile_id = $1",
          [kid],
        ),
      );
      expect(record).toMatchObject({ grade_level: 3, school_id: schoolId });
    });
  });

  it("links a guardian to the named student on a guardian invite", async () => {
    await withRollback(async (db) => {
      const { admin, schoolId, student } = await seedClassroom(db);
      const token = await invite(db, admin, schoolId, "mom@example.com", "guardian", {
        studentId: student,
      });
      const mom = await db.createUser({ email: "mom@example.com" });
      await db.asUser(mom, (q) => q.run("select public.accept_invitation($1)", [token]));

      const links = await db.asUser(mom, (q) =>
        q.run<{ student_id: string }>("select student_id from public.guardian_links"),
      );
      expect(links.map((l) => l.student_id)).toEqual([student]);
    });
  });

  it("refuses acceptance from an account with a different email", async () => {
    // The token alone is not the credential; a forwarded link is harmless.
    await withRollback(async (db) => {
      const { admin, schoolId } = await seedClassroom(db);
      const token = await invite(db, admin, schoolId, "intended@example.com", "teacher");
      const impostor = await db.createUser({ email: "someone.else@example.com" });

      const result = await db.asUser(impostor, (q) =>
        q.attempt("select public.accept_invitation($1)", [token]),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/different email/i);

      const rows = await db.seed("select 1 from public.memberships where profile_id = $1", [
        impostor,
      ]);
      expect(rows).toHaveLength(0);
    });
  });

  it("refuses an expired or already-accepted invitation", async () => {
    await withRollback(async (db) => {
      const { admin, schoolId } = await seedClassroom(db);
      const token = await invite(db, admin, schoolId, "late@example.com", "teacher");
      const late = await db.createUser({ email: "late@example.com" });

      await db.seed("update public.invitations set expires_at = now() - interval '1 day' where token = $1", [
        token,
      ]);
      const expired = await db.asUser(late, (q) =>
        q.attempt("select public.accept_invitation($1)", [token]),
      );
      expect(expired.ok).toBe(false);
      expect(expired.error).toMatch(/expired/i);

      await db.seed("update public.invitations set expires_at = now() + interval '1 day' where token = $1", [
        token,
      ]);
      await db.asUser(late, (q) => q.run("select public.accept_invitation($1)", [token]));
      const again = await db.asUser(late, (q) =>
        q.attempt("select public.accept_invitation($1)", [token]),
      );
      expect(again.ok).toBe(false);
      expect(again.error).toMatch(/already accepted/i);
    });
  });

  it("is an administrator's instrument only", async () => {
    await withRollback(async (db) => {
      const { teacher, student, schoolId } = await seedClassroom(db);
      for (const who of [teacher, student]) {
        const created = await db.asUser(who, (q) =>
          q.attempt(
            `insert into public.invitations (school_id, email, role)
             values ($1, 'x@example.com', 'teacher') returning id`,
            [schoolId],
          ),
        );
        expect(created.ok && created.rows.length > 0).toBe(false);

        const listed = await db.asUser(who, (q) =>
          q.run<{ id: string }>("select id from public.invitations"),
        );
        expect(listed).toHaveLength(0);
      }
    });
  });

  it("resolves student emails for rostering, to admins of that school only", async () => {
    await withRollback(async (db) => {
      const { admin, student, schoolId } = await seedClassroom(db);
      const b = await seedClassroom(db, { tag: "b" });

      const found = await db.asUser(admin, (q) =>
        q.run<{ id: string }>(
          "select id from public.find_school_students_by_email($1, $2)",
          [schoolId, ["student@s1.test", "student@b.test"]],
        ),
      );
      // The other school's student does not resolve even by exact email.
      expect(found.map((f) => f.id)).toEqual([student]);

      const refused = await db.asUser(b.teacher, (q) =>
        q.attempt("select * from public.find_school_students_by_email($1, $2)", [
          b.schoolId,
          ["student@b.test"],
        ]),
      );
      expect(refused.ok).toBe(false);
    });
  });
});

describe("courses", () => {
  it("are readable by every member of the school and nobody else", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });
      for (const who of [a.teacher, a.student]) {
        const seen = await db.asUser(who, (q) =>
          q.run<{ id: string }>("select id from public.courses"),
        );
        expect(seen.map((c) => c.id)).toEqual([a.courseId]);
      }
      const outsider = await db.asUser(b.teacher, (q) =>
        q.run<{ id: string }>("select id from public.courses where id = $1", [a.courseId]),
      );
      expect(outsider).toHaveLength(0);
    });
  });

  it("lets a teacher add a course they author and edit it, but not a colleague's", async () => {
    await withRollback(async (db) => {
      const { teacher, schoolId, admin } = await seedClassroom(db);
      const colleague = await db.createUser({ email: "colleague@s1.test" });
      await addMember(db, schoolId, colleague, "teacher");

      const [mine] = await db.asUser(teacher, (q) =>
        q.run<{ id: string }>(
          `insert into public.courses (school_id, title, created_by)
           values ($1, 'Biology', $2) returning id`,
          [schoolId, teacher],
        ),
      );
      const edited = await db.asUser(teacher, (q) =>
        q.run<{ id: string }>(
          "update public.courses set title = 'Biology I' where id = $1 returning id",
          [mine.id],
        ),
      );
      expect(edited).toHaveLength(1);

      const theirs = await db.asUser(colleague, (q) =>
        q.attempt("update public.courses set title = 'Hijacked' where id = $1 returning id", [
          mine.id,
        ]),
      );
      expect(theirs.ok && theirs.rows.length > 0).toBe(false);

      // An admin edits anything at the school.
      const byAdmin = await db.asUser(admin, (q) =>
        q.run<{ id: string }>(
          "update public.courses set status = 'published' where id = $1 returning id",
          [mine.id],
        ),
      );
      expect(byAdmin).toHaveLength(1);
    });
  });

  it("stops a student from creating courses", async () => {
    await withRollback(async (db) => {
      const { student, schoolId } = await seedClassroom(db);
      const result = await db.asUser(student, (q) =>
        q.attempt(
          "insert into public.courses (school_id, title, created_by) values ($1, 'Mine', $2) returning id",
          [schoolId, student],
        ),
      );
      expect(result.ok && result.rows.length > 0).toBe(false);
    });
  });

  it("stops authoring a course into a school you are not a teacher at", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });
      const result = await db.asUser(a.teacher, (q) =>
        q.attempt(
          "insert into public.courses (school_id, title, created_by) values ($1, 'Mine', $2) returning id",
          [b.schoolId, a.teacher],
        ),
      );
      expect(result.ok && result.rows.length > 0).toBe(false);
      void seedCourse;
    });
  });
});
