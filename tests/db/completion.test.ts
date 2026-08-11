import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback } from "./harness";
import { completedAt, completeLesson, enroll, seedCourse } from "./fixtures";

beforeAll(connect);
afterAll(disconnect);

describe("derived course completion", () => {
  it("leaves completed_at null while lessons remain", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db, { lessonCount: 3 });
      await enroll(db, courseId, student);

      await completeLesson(db, lessonIds[0], student);
      expect(await completedAt(db, courseId, student)).toBeNull();

      await completeLesson(db, lessonIds[1], student);
      expect(await completedAt(db, courseId, student)).toBeNull();
    });
  });

  it("stamps completed_at when the final lesson is completed", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db, { lessonCount: 3 });
      await enroll(db, courseId, student);

      for (const lessonId of lessonIds) {
        await completeLesson(db, lessonId, student);
      }
      expect(await completedAt(db, courseId, student)).not.toBeNull();
    });
  });

  it("clears completed_at when progress is withdrawn", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db, { lessonCount: 2 });
      await enroll(db, courseId, student);
      for (const lessonId of lessonIds) await completeLesson(db, lessonId, student);
      expect(await completedAt(db, courseId, student)).not.toBeNull();

      await db.seed("delete from public.lesson_progress where lesson_id = $1", [
        lessonIds[1],
      ]);
      expect(await completedAt(db, courseId, student)).toBeNull();
    });
  });

  it("does not affect another student's enrollment", async () => {
    await withRollback(async (db) => {
      const finisher = await db.createUser({ email: "f@example.com", role: "student" });
      const starter = await db.createUser({ email: "b@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db, { lessonCount: 2 });
      await enroll(db, courseId, finisher);
      await enroll(db, courseId, starter);

      for (const lessonId of lessonIds) await completeLesson(db, lessonId, finisher);

      expect(await completedAt(db, courseId, finisher)).not.toBeNull();
      expect(await completedAt(db, courseId, starter)).toBeNull();
    });
  });

  it("reopens finished enrollments when a lesson is added to the course", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId, lessonIds } = await seedCourse(db, { lessonCount: 2 });
      await enroll(db, courseId, student);
      for (const lessonId of lessonIds) await completeLesson(db, lessonId, student);
      expect(await completedAt(db, courseId, student)).not.toBeNull();

      await db.seed(
        `insert into public.lessons (course_id, title, content, position)
         values ($1, 'Bonus lesson', 'more', 3)`,
        [courseId],
      );
      expect(await completedAt(db, courseId, student)).toBeNull();
    });
  });

  it("does not touch enrollments of unrelated courses when a lesson is added", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const finished = await seedCourse(db, { lessonCount: 1, title: "Finished" });
      const other = await seedCourse(db, { lessonCount: 1, title: "Other" });
      await enroll(db, finished.courseId, student);
      await enroll(db, other.courseId, student);
      await completeLesson(db, finished.lessonIds[0], student);

      await db.seed(
        `insert into public.lessons (course_id, title, content, position)
         values ($1, 'Extra', 'x', 2)`,
        [other.courseId],
      );
      expect(await completedAt(db, finished.courseId, student)).not.toBeNull();
    });
  });
});

describe("enrollment integrity", () => {
  it("stops a student from stamping their own completion", async () => {
    // completed_at drives the admin completion-rate stat, so it must not be
    // writable from a browser session.
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { lessonCount: 3 });
      await enroll(db, courseId, student);

      const result = await db.asUser(student, (q) =>
        q.attempt(
          `update public.enrollments set completed_at = now()
           where course_id = $1 and student_id = $2 returning id`,
          [courseId, student],
        ),
      );
      expect(result.ok && result.rows.length > 0).toBe(false);
      expect(await completedAt(db, courseId, student)).toBeNull();
    });
  });

  it("lets a student enroll themselves in a published course", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db);

      const result = await db.asUser(student, (q) =>
        q.attempt(
          "insert into public.enrollments (course_id, student_id) values ($1, $2) returning id",
          [courseId, student],
        ),
      );
      expect(result.ok).toBe(true);
    });
  });

  it("blocks enrolling in an unpublished course", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { status: "draft" });

      const result = await db.asUser(student, (q) =>
        q.attempt(
          "insert into public.enrollments (course_id, student_id) values ($1, $2)",
          [courseId, student],
        ),
      );
      expect(result.ok).toBe(false);
    });
  });

  it("blocks enrolling somebody else", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const victim = await db.createUser({ email: "v@example.com", role: "student" });
      const { courseId } = await seedCourse(db);

      const result = await db.asUser(student, (q) =>
        q.attempt(
          "insert into public.enrollments (course_id, student_id) values ($1, $2)",
          [courseId, victim],
        ),
      );
      expect(result.ok).toBe(false);
    });
  });

  it("blocks a parent from enrolling themselves", async () => {
    await withRollback(async (db) => {
      const parent = await db.createUser({ email: "p@example.com", role: "parent" });
      const { courseId } = await seedCourse(db);

      const result = await db.asUser(parent, (q) =>
        q.attempt(
          "insert into public.enrollments (course_id, student_id) values ($1, $2)",
          [courseId, parent],
        ),
      );
      expect(result.ok).toBe(false);
    });
  });

  it("lets an admin enroll any student", async () => {
    await withRollback(async (db) => {
      const admin = await db.createUser({ email: "admin@example.com" });
      await db.setRole(admin, "admin");
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db, { status: "draft" });

      const result = await db.asUser(admin, (q) =>
        q.attempt(
          "insert into public.enrollments (course_id, student_id) values ($1, $2) returning id",
          [courseId, student],
        ),
      );
      expect(result.ok).toBe(true);
    });
  });
});
