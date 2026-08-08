import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback } from "./harness";
import { enroll, linkParent, seedCourse } from "./fixtures";

beforeAll(connect);
afterAll(disconnect);

async function seedSession(
  db: Parameters<Parameters<typeof withRollback>[0]>[0],
  courseId: string,
): Promise<string> {
  const [row] = await db.seed<{ id: string }>(
    `insert into public.live_sessions
       (course_id, title, starts_at, zoom_meeting_id, join_url, recording_url)
     values ($1, 'Office hours', now() + interval '1 day', '999',
             'https://zoom.example/join', 'https://zoom.example/rec')
     returning id`,
    [courseId],
  );
  return row.id;
}

describe("course visibility", () => {
  it("shows published courses to any signed-in user", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      await seedCourse(db, { title: "Published" });

      const rows = await db.asUser(student, (q) =>
        q.run<{ title: string }>("select title from public.courses"),
      );
      expect(rows.map((r) => r.title)).toEqual(["Published"]);
    });
  });

  it("hides draft and archived courses from students", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      await seedCourse(db, { status: "draft", title: "Draft" });
      await seedCourse(db, { status: "archived", title: "Archived" });

      const rows = await db.asUser(student, (q) =>
        q.run("select id from public.courses"),
      );
      expect(rows).toEqual([]);
    });
  });

  it("hides every course from anonymous callers", async () => {
    await withRollback(async (db) => {
      await seedCourse(db);
      const rows = await db.asAnon((q) => q.run("select id from public.courses"));
      expect(rows).toEqual([]);
    });
  });

  it("shows drafts to admins", async () => {
    await withRollback(async (db) => {
      const admin = await db.createUser({ email: "admin@example.com" });
      await db.setRole(admin, "admin");
      await seedCourse(db, { status: "draft" });

      const rows = await db.asUser(admin, (q) =>
        q.run("select id from public.courses"),
      );
      expect(rows).toHaveLength(1);
    });
  });

  it("stops a student from creating or editing courses", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db);

      const insert = await db.asUser(student, (q) =>
        q.attempt(
          "insert into public.courses (title, status) values ('Mine', 'published')",
        ),
      );
      expect(insert.ok).toBe(false);

      const update = await db.asUser(student, (q) =>
        q.attempt("update public.courses set title = 'Hacked' where id = $1 returning id", [
          courseId,
        ]),
      );
      expect(update.ok && update.rows.length > 0).toBe(false);
    });
  });

  it("stops a student from authoring lessons", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db);
      await enroll(db, courseId, student);

      const result = await db.asUser(student, (q) =>
        q.attempt(
          `insert into public.lessons (course_id, title, content, position)
           values ($1, 'Mine', 'x', 99)`,
          [courseId],
        ),
      );
      expect(result.ok).toBe(false);
    });
  });
});

describe("live session visibility", () => {
  it("hides Zoom links from a signed-in user who is not enrolled", async () => {
    // join_url and recording_url are effectively access tokens for the
    // meeting, so publication status alone must not expose them.
    await withRollback(async (db) => {
      const outsider = await db.createUser({ email: "o@example.com", role: "student" });
      const { courseId } = await seedCourse(db);
      await seedSession(db, courseId);

      const rows = await db.asUser(outsider, (q) =>
        q.run("select join_url from public.live_sessions"),
      );
      expect(rows).toEqual([]);
    });
  });

  it("shows sessions to an enrolled student", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db);
      await seedSession(db, courseId);
      await enroll(db, courseId, student);

      const rows = await db.asUser(student, (q) =>
        q.run<{ join_url: string }>("select join_url from public.live_sessions"),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].join_url).toBe("https://zoom.example/join");
    });
  });

  it("shows sessions to a linked parent", async () => {
    await withRollback(async (db) => {
      const parent = await db.createUser({ email: "p@example.com", role: "parent" });
      const child = await db.createUser({ email: "c@example.com", role: "student" });
      const { courseId } = await seedCourse(db);
      await seedSession(db, courseId);
      await linkParent(db, parent, child);
      await enroll(db, courseId, child);

      const rows = await db.asUser(parent, (q) =>
        q.run("select id from public.live_sessions"),
      );
      expect(rows).toHaveLength(1);
    });
  });

  it("hides sessions from an unlinked parent", async () => {
    await withRollback(async (db) => {
      const parent = await db.createUser({ email: "p@example.com", role: "parent" });
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db);
      await seedSession(db, courseId);
      await enroll(db, courseId, student);

      const rows = await db.asUser(parent, (q) =>
        q.run("select id from public.live_sessions"),
      );
      expect(rows).toEqual([]);
    });
  });

  it("stops a student from scheduling a session", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const { courseId } = await seedCourse(db);
      await enroll(db, courseId, student);

      const result = await db.asUser(student, (q) =>
        q.attempt(
          `insert into public.live_sessions (course_id, title, starts_at)
           values ($1, 'Fake', now())`,
          [courseId],
        ),
      );
      expect(result.ok).toBe(false);
    });
  });
});

describe("notifications", () => {
  async function seedNotification(
    db: Parameters<Parameters<typeof withRollback>[0]>[0],
    userId: string,
    title: string,
  ) {
    await db.seed(
      "insert into public.notifications (user_id, title, body) values ($1, $2, 'body')",
      [userId, title],
    );
  }

  it("lets a user read only their own notifications", async () => {
    await withRollback(async (db) => {
      const mine = await db.createUser({ email: "m@example.com", role: "student" });
      const theirs = await db.createUser({ email: "t@example.com", role: "student" });
      await seedNotification(db, mine, "Mine");
      await seedNotification(db, theirs, "Theirs");

      const rows = await db.asUser(mine, (q) =>
        q.run<{ title: string }>("select title from public.notifications"),
      );
      expect(rows.map((r) => r.title)).toEqual(["Mine"]);
    });
  });

  it("lets a user mark their own notification read", async () => {
    await withRollback(async (db) => {
      const user = await db.createUser({ email: "u@example.com", role: "student" });
      await seedNotification(db, user, "Ping");

      const result = await db.asUser(user, (q) =>
        q.attempt(
          "update public.notifications set read_at = now() where user_id = $1 returning id",
          [user],
        ),
      );
      expect(result.ok).toBe(true);
      expect(result.rows).toHaveLength(1);
    });
  });

  it("stops a user from marking somebody else's notification read", async () => {
    await withRollback(async (db) => {
      const user = await db.createUser({ email: "u@example.com", role: "student" });
      const other = await db.createUser({ email: "o@example.com", role: "student" });
      await seedNotification(db, other, "Theirs");

      const result = await db.asUser(user, (q) =>
        q.attempt(
          "update public.notifications set read_at = now() where user_id = $1 returning id",
          [other],
        ),
      );
      expect(result.ok && result.rows.length > 0).toBe(false);
    });
  });

  it("stops a student from fabricating notifications", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const result = await db.asUser(student, (q) =>
        q.attempt(
          "insert into public.notifications (user_id, title) values ($1, 'Fake')",
          [student],
        ),
      );
      expect(result.ok).toBe(false);
    });
  });
});

describe("parent-student links", () => {
  it("stops a parent from linking themselves to a student", async () => {
    await withRollback(async (db) => {
      const parent = await db.createUser({ email: "p@example.com", role: "parent" });
      const student = await db.createUser({ email: "s@example.com", role: "student" });

      const result = await db.asUser(parent, (q) =>
        q.attempt(
          "insert into public.parent_student_links (parent_id, student_id) values ($1, $2)",
          [parent, student],
        ),
      );
      expect(result.ok).toBe(false);
    });
  });

  it("lets an admin create a link", async () => {
    await withRollback(async (db) => {
      const admin = await db.createUser({ email: "admin@example.com" });
      await db.setRole(admin, "admin");
      const parent = await db.createUser({ email: "p@example.com", role: "parent" });
      const student = await db.createUser({ email: "s@example.com", role: "student" });

      const result = await db.asUser(admin, (q) =>
        q.attempt(
          `insert into public.parent_student_links (parent_id, student_id)
           values ($1, $2) returning parent_id`,
          [parent, student],
        ),
      );
      expect(result.ok).toBe(true);
    });
  });

  it("shows a link to both parties but not to strangers", async () => {
    await withRollback(async (db) => {
      const parent = await db.createUser({ email: "p@example.com", role: "parent" });
      const student = await db.createUser({ email: "s@example.com", role: "student" });
      const stranger = await db.createUser({ email: "x@example.com", role: "student" });
      await linkParent(db, parent, student);

      for (const viewer of [parent, student]) {
        const rows = await db.asUser(viewer, (q) =>
          q.run("select parent_id from public.parent_student_links"),
        );
        expect(rows).toHaveLength(1);
      }

      const strangerRows = await db.asUser(stranger, (q) =>
        q.run("select parent_id from public.parent_student_links"),
      );
      expect(strangerRows).toEqual([]);
    });
  });
});
