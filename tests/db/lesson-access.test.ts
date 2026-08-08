import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback } from "./harness";
import { completeLesson, enroll, linkParent, seedCourse } from "./fixtures";

beforeAll(connect);
afterAll(disconnect);

describe("lesson content visibility", () => {
  it("hides lesson content from a student who is not enrolled", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      await seedCourse(db);

      const rows = await db.asUser(student, (q) =>
        q.run("select id, content, video_url from public.lessons"),
      );
      expect(rows).toEqual([]);
    });
  });

  it("exposes only the unlocked lesson's content to an enrolled student", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db, { lessonCount: 3 });
      await enroll(db, courseId, student);

      const rows = await db.asUser(student, (q) =>
        q.run<{ id: string }>("select id from public.lessons"),
      );
      expect(rows.map((r) => r.id)).toEqual([lessonIds[0]]);
    });
  });

  it("exposes the next lesson's content once the previous one is complete", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db, { lessonCount: 3 });
      await enroll(db, courseId, student);
      await completeLesson(db, lessonIds[0], student);

      const rows = await db.asUser(student, (q) =>
        q.run<{ id: string }>("select id from public.lessons order by position"),
      );
      expect(rows.map((r) => r.id)).toEqual([lessonIds[0], lessonIds[1]]);
    });
  });

  it("exposes every lesson when the course does not unlock sequentially", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db, {
        sequentialUnlock: false,
        lessonCount: 3,
      });
      await enroll(db, courseId, student);

      const rows = await db.asUser(student, (q) =>
        q.run("select id from public.lessons"),
      );
      expect(rows).toHaveLength(lessonIds.length);
    });
  });

  it("hides lessons of an unpublished course even from an enrolled student", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { status: "draft" });
      await enroll(db, courseId, student);

      const rows = await db.asUser(student, (q) =>
        q.run("select id from public.lessons"),
      );
      expect(rows).toEqual([]);
    });
  });

  it("lets a linked parent read the lessons of a course their child takes", async () => {
    await withRollback(async (db) => {
      const parent = await db.createUser({ email: "p@example.com", role: "parent" });
      const child = await db.createUser({ email: "c@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db, { lessonCount: 2 });
      await linkParent(db, parent, child);
      await enroll(db, courseId, child);

      const rows = await db.asUser(parent, (q) =>
        q.run("select id from public.lessons"),
      );
      expect(rows).toHaveLength(lessonIds.length);
    });
  });

  it("hides lessons from a parent with no linked enrollment", async () => {
    await withRollback(async (db) => {
      const parent = await db.createUser({ email: "p@example.com", role: "parent" });
      await seedCourse(db);

      const rows = await db.asUser(parent, (q) =>
        q.run("select id from public.lessons"),
      );
      expect(rows).toEqual([]);
    });
  });

  it("lets an admin read every lesson", async () => {
    await withRollback(async (db) => {
      const admin = await db.createUser({ email: "admin@example.com" });
      await db.setRole(admin, "admin");
      const { lessonIds } = await seedCourse(db, { status: "draft", lessonCount: 2 });

      const rows = await db.asUser(admin, (q) =>
        q.run("select id from public.lessons"),
      );
      expect(rows).toHaveLength(lessonIds.length);
    });
  });
});

describe("lesson_catalog view", () => {
  it("lets any signed-in user browse published curricula", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "browser@example.com", role: "student" });
      const { lessonIds } = await seedCourse(db, { lessonCount: 3 });

      const rows = await db.asUser(student, (q) =>
        q.run<{ title: string }>(
          "select title, position from public.lesson_catalog order by position",
        ),
      );
      expect(rows).toHaveLength(lessonIds.length);
      expect(rows[0].title).toBe("Lesson 1");
    });
  });

  it("does not expose lesson content or video URLs", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "browser@example.com", role: "student" });
      await seedCourse(db);

      const columns = await db.asUser(student, (q) =>
        q.run<{ column_name: string }>(
          `select column_name from information_schema.columns
           where table_schema = 'public' and table_name = 'lesson_catalog'`,
        ),
      );
      const names = columns.map((c) => c.column_name);
      expect(names).not.toContain("content");
      expect(names).not.toContain("video_url");
      expect(names).toContain("title");
    });
  });

  it("omits unpublished courses", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "browser@example.com", role: "student" });
      await seedCourse(db, { status: "draft" });

      const rows = await db.asUser(student, (q) =>
        q.run("select id from public.lesson_catalog"),
      );
      expect(rows).toEqual([]);
    });
  });

  it("is not readable anonymously", async () => {
    await withRollback(async (db) => {
      await seedCourse(db);
      const result = await db.asAnon((q) =>
        q.attempt("select id from public.lesson_catalog"),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/permission denied/i);
    });
  });
});

describe("lesson progress writes", () => {
  it("lets an enrolled student complete the first lesson", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db);
      await enroll(db, courseId, student);

      const result = await db.asUser(student, (q) =>
        q.attempt(
          `insert into public.lesson_progress (lesson_id, student_id, completed_at)
           values ($1, $2, now()) returning id`,
          [lessonIds[0], student],
        ),
      );
      expect(result.ok).toBe(true);
    });
  });

  it("blocks completing a locked lesson", async () => {
    // The core integrity guarantee: skipping ahead must fail in the database,
    // not merely be hidden by the UI.
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db, { lessonCount: 3 });
      await enroll(db, courseId, student);

      const result = await db.asUser(student, (q) =>
        q.attempt(
          `insert into public.lesson_progress (lesson_id, student_id, completed_at)
           values ($1, $2, now())`,
          [lessonIds[2], student],
        ),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/row-level security/i);
    });
  });

  it("blocks progress on a course the student is not enrolled in", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { lessonIds } = await seedCourse(db);

      const result = await db.asUser(student, (q) =>
        q.attempt(
          `insert into public.lesson_progress (lesson_id, student_id, completed_at)
           values ($1, $2, now())`,
          [lessonIds[0], student],
        ),
      );
      expect(result.ok).toBe(false);
    });
  });

  it("blocks recording progress on behalf of another student", async () => {
    await withRollback(async (db) => {
      const attacker = await db.createUser({ email: "a@example.com", role: "student" });
      const victim = await db.createUser({ email: "v@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db);
      await enroll(db, courseId, attacker);
      await enroll(db, courseId, victim);

      const result = await db.asUser(attacker, (q) =>
        q.attempt(
          `insert into public.lesson_progress (lesson_id, student_id, completed_at)
           values ($1, $2, now())`,
          [lessonIds[0], victim],
        ),
      );
      expect(result.ok).toBe(false);
    });
  });

  it("blocks re-pointing an existing progress row at a locked lesson", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db, { lessonCount: 3 });
      await enroll(db, courseId, student);
      await completeLesson(db, lessonIds[0], student);

      const result = await db.asUser(student, (q) =>
        q.attempt(
          `update public.lesson_progress set lesson_id = $1
           where lesson_id = $2 and student_id = $3 returning id`,
          [lessonIds[2], lessonIds[0], student],
        ),
      );
      expect(result.ok && result.rows.length > 0).toBe(false);
    });
  });

  it("lets a student read only their own progress", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const other = await db.createUser({ email: "o@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db);
      await enroll(db, courseId, student);
      await enroll(db, courseId, other);
      await completeLesson(db, lessonIds[0], student);
      await completeLesson(db, lessonIds[0], other);

      const rows = await db.asUser(student, (q) =>
        q.run<{ student_id: string }>("select student_id from public.lesson_progress"),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].student_id).toBe(student);
    });
  });

  it("lets a linked parent read their child's progress but not a stranger's", async () => {
    await withRollback(async (db) => {
      const parent = await db.createUser({ email: "p@example.com", role: "parent" });
      const child = await db.createUser({ email: "c@example.com", role: "student" });
      const stranger = await db.createUser({ email: "x@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db);
      await linkParent(db, parent, child);
      await enroll(db, courseId, child);
      await enroll(db, courseId, stranger);
      await completeLesson(db, lessonIds[0], child);
      await completeLesson(db, lessonIds[0], stranger);

      const rows = await db.asUser(parent, (q) =>
        q.run<{ student_id: string }>("select student_id from public.lesson_progress"),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].student_id).toBe(child);
    });
  });
});
