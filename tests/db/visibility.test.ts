import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback } from "./harness";
import { addMember, enrollStudent, linkGuardian, seedClassroom, seedSection } from "./fixtures";

beforeAll(connect);
afterAll(disconnect);

describe("profile visibility", () => {
  it("lets a student see themselves and their teacher, not a classmate", async () => {
    await withRollback(async (db) => {
      const { student, teacher, schoolId, sectionId } = await seedClassroom(db);
      const mate = await db.createUser({ email: "mate@s1.test" });
      await addMember(db, schoolId, mate, "student");
      await enrollStudent(db, sectionId, mate);

      const seen = await db.asUser(student, (q) =>
        q.run<{ id: string }>("select id from public.profiles"),
      );
      expect(seen.map((p) => p.id).sort()).toEqual([student, teacher].sort());
    });
  });

  it("lets a teacher see their roster and a student's guardian, not another roster", async () => {
    await withRollback(async (db) => {
      const { teacher, student, schoolId, courseId, termId } = await seedClassroom(db);
      const guardian = await db.createUser({ email: "guardian@s1.test" });
      await addMember(db, schoolId, guardian, "guardian");
      await linkGuardian(db, guardian, student);
      const colleague = await db.createUser({ email: "colleague@s1.test" });
      await addMember(db, schoolId, colleague, "teacher");
      const theirs = await seedSection(db, { courseId, termId, teacherId: colleague });
      const theirKid = await db.createUser({ email: "kid2@s1.test" });
      await addMember(db, schoolId, theirKid, "student");
      await enrollStudent(db, theirs, theirKid);

      const seen = await db.asUser(teacher, (q) =>
        q.run<{ id: string }>("select id from public.profiles"),
      );
      expect(seen.map((p) => p.id).sort()).toEqual([teacher, student, guardian].sort());
    });
  });

  it("lets a guardian see their child but not another child", async () => {
    await withRollback(async (db) => {
      const { student, schoolId, sectionId } = await seedClassroom(db);
      const guardian = await db.createUser({ email: "guardian@s1.test" });
      await addMember(db, schoolId, guardian, "guardian");
      await linkGuardian(db, guardian, student);
      const mate = await db.createUser({ email: "mate@s1.test" });
      await addMember(db, schoolId, mate, "student");
      await enrollStudent(db, sectionId, mate);

      const seen = await db.asUser(guardian, (q) =>
        q.run<{ id: string }>("select id from public.profiles"),
      );
      expect(seen.map((p) => p.id)).toContain(student);
      expect(seen.map((p) => p.id)).not.toContain(mate);
    });
  });

  it("lets an admin see every member of their school and nobody elsewhere", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });
      const seen = await db.asUser(a.admin, (q) =>
        q.run<{ id: string }>("select id from public.profiles"),
      );
      expect(seen.map((p) => p.id).sort()).toEqual([a.admin, a.teacher, a.student].sort());
      expect(seen.map((p) => p.id)).not.toContain(b.student);
    });
  });

  it("lets a user rename themselves and nobody else", async () => {
    await withRollback(async (db) => {
      const { student, teacher } = await seedClassroom(db);
      const own = await db.asUser(student, (q) =>
        q.run<{ full_name: string }>(
          "update public.profiles set full_name = 'Sam' where id = $1 returning full_name",
          [student],
        ),
      );
      expect(own[0].full_name).toBe("Sam");
      const other = await db.asUser(student, (q) =>
        q.attempt("update public.profiles set full_name = 'X' where id = $1 returning id", [
          teacher,
        ]),
      );
      expect(other.ok && other.rows.length > 0).toBe(false);
    });
  });
});

describe("student records", () => {
  it("are visible to the student, guardian, teacher and admin, not to a classmate", async () => {
    await withRollback(async (db) => {
      const { student, teacher, admin, schoolId, sectionId } = await seedClassroom(db);
      const guardian = await db.createUser({ email: "guardian@s1.test" });
      await addMember(db, schoolId, guardian, "guardian");
      await linkGuardian(db, guardian, student);
      const mate = await db.createUser({ email: "mate@s1.test" });
      await addMember(db, schoolId, mate, "student");
      await enrollStudent(db, sectionId, mate);

      for (const who of [student, guardian, teacher, admin]) {
        const rows = await db.asUser(who, (q) =>
          q.run<{ profile_id: string }>("select profile_id from public.students where profile_id = $1", [
            student,
          ]),
        );
        expect(rows).toHaveLength(1);
      }
      const hidden = await db.asUser(mate, (q) =>
        q.run("select profile_id from public.students where profile_id = $1", [student]),
      );
      expect(hidden).toHaveLength(0);
    });
  });

  it("can be changed only by the school's admins", async () => {
    await withRollback(async (db) => {
      const { student, teacher, admin } = await seedClassroom(db);
      for (const who of [student, teacher]) {
        const result = await db.asUser(who, (q) =>
          q.attempt(
            "update public.students set grade_level = 12 where profile_id = $1 returning profile_id",
            [student],
          ),
        );
        expect(result.ok && result.rows.length > 0).toBe(false);
      }
      const byAdmin = await db.asUser(admin, (q) =>
        q.run<{ grade_level: number }>(
          "update public.students set grade_level = 6 where profile_id = $1 returning grade_level",
          [student],
        ),
      );
      expect(byAdmin[0].grade_level).toBe(6);
    });
  });
});

describe("guardian links", () => {
  it("cannot be created by the guardian themselves", async () => {
    await withRollback(async (db) => {
      const { student, schoolId } = await seedClassroom(db);
      const guardian = await db.createUser({ email: "guardian@s1.test" });
      await addMember(db, schoolId, guardian, "guardian");
      const result = await db.asUser(guardian, (q) =>
        q.attempt(
          "insert into public.guardian_links (guardian_id, student_id) values ($1, $2) returning id",
          [guardian, student],
        ),
      );
      expect(result.ok && result.rows.length > 0).toBe(false);
    });
  });

  it("are created by an admin and visible to both parties, not to strangers", async () => {
    await withRollback(async (db) => {
      const { student, admin, teacher, schoolId } = await seedClassroom(db);
      const guardian = await db.createUser({ email: "guardian@s1.test" });
      await addMember(db, schoolId, guardian, "guardian");

      const created = await db.asUser(admin, (q) =>
        q.run<{ id: string }>(
          "insert into public.guardian_links (guardian_id, student_id) values ($1, $2) returning id",
          [guardian, student],
        ),
      );
      expect(created).toHaveLength(1);

      for (const who of [guardian, student]) {
        const rows = await db.asUser(who, (q) => q.run("select id from public.guardian_links"));
        expect(rows).toHaveLength(1);
      }
      const other = await db.asUser(teacher, (q) => q.run("select id from public.guardian_links"));
      expect(other).toHaveLength(0);
    });
  });
});

describe("live sessions", () => {
  it("are visible to the section's students, staff and guardians", async () => {
    await withRollback(async (db) => {
      const { student, teacher, admin, schoolId, sectionId } = await seedClassroom(db);
      const guardian = await db.createUser({ email: "guardian@s1.test" });
      await addMember(db, schoolId, guardian, "guardian");
      await linkGuardian(db, guardian, student);
      await db.seed(
        `insert into public.live_sessions (section_id, title, provider, join_url, starts_at)
         values ($1, 'Class', 'zoom', 'https://zoom.us/j/1', now() + interval '1 day')`,
        [sectionId],
      );
      for (const who of [student, teacher, admin, guardian]) {
        const rows = await db.asUser(who, (q) =>
          q.run<{ join_url: string }>("select join_url from public.live_sessions"),
        );
        expect(rows).toHaveLength(1);
      }
    });
  });

  it("hide the join link from a student in another section and an unlinked guardian", async () => {
    await withRollback(async (db) => {
      const { schoolId, sectionId, courseId, termId } = await seedClassroom(db);
      await db.seed(
        `insert into public.live_sessions (section_id, title, provider, join_url, starts_at)
         values ($1, 'Class', 'zoom', 'https://zoom.us/j/1', now() + interval '1 day')`,
        [sectionId],
      );
      const other = await db.createUser({ email: "other@s1.test" });
      await addMember(db, schoolId, other, "student");
      await enrollStudent(db, await seedSection(db, { courseId, termId, name: "P2" }), other);
      const guardian = await db.createUser({ email: "guardian@s1.test" });
      await addMember(db, schoolId, guardian, "guardian");

      for (const who of [other, guardian]) {
        const rows = await db.asUser(who, (q) => q.run("select id from public.live_sessions"));
        expect(rows).toHaveLength(0);
      }
    });
  });

  it("are scheduled by the section's teacher, not by its students", async () => {
    await withRollback(async (db) => {
      const { student, teacher, sectionId } = await seedClassroom(db);
      const byTeacher = await db.asUser(teacher, (q) =>
        q.run<{ id: string }>(
          `insert into public.live_sessions (section_id, title, starts_at)
           values ($1, 'Class', now()) returning id`,
          [sectionId],
        ),
      );
      expect(byTeacher).toHaveLength(1);
      const byStudent = await db.asUser(student, (q) =>
        q.attempt(
          `insert into public.live_sessions (section_id, title, starts_at)
           values ($1, 'Class', now()) returning id`,
          [sectionId],
        ),
      );
      expect(byStudent.ok && byStudent.rows.length > 0).toBe(false);
    });
  });
});

describe("notifications", () => {
  it("are readable and markable only by their recipient, never fabricated", async () => {
    await withRollback(async (db) => {
      const { student, teacher } = await seedClassroom(db);
      const [note] = await db.seed<{ id: string }>(
        `insert into public.notifications (user_id, title) values ($1, 'Hi') returning id`,
        [student],
      );

      const mine = await db.asUser(student, (q) =>
        q.run<{ id: string }>("select id from public.notifications"),
      );
      expect(mine.map((n) => n.id)).toEqual([note.id]);
      const theirs = await db.asUser(teacher, (q) => q.run("select id from public.notifications"));
      expect(theirs).toHaveLength(0);

      const marked = await db.asUser(student, (q) =>
        q.run<{ id: string }>(
          "update public.notifications set read_at = now() where id = $1 returning id",
          [note.id],
        ),
      );
      expect(marked).toHaveLength(1);
      const forged = await db.asUser(teacher, (q) =>
        q.attempt(
          "update public.notifications set read_at = now() where id = $1 returning id",
          [note.id],
        ),
      );
      expect(forged.ok && forged.rows.length > 0).toBe(false);

      const fabricated = await db.asUser(student, (q) =>
        q.attempt(
          "insert into public.notifications (user_id, title) values ($1, 'Fake') returning id",
          [teacher],
        ),
      );
      expect(fabricated.ok && fabricated.rows.length > 0).toBe(false);
    });
  });
});
