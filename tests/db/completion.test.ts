import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback } from "./harness";
import {
  addMember,
  completeItem,
  completedAt,
  enrollStudent,
  seedClassroom,
  seedItem,
} from "./fixtures";

beforeAll(connect);
afterAll(disconnect);

describe("derived section completion", () => {
  it("leaves completed_at null while required items remain", async () => {
    await withRollback(async (db) => {
      const { student, sectionId, itemIds } = await seedClassroom(db);
      await completeItem(db, itemIds[0], student);
      await completeItem(db, itemIds[1], student);
      expect(await completedAt(db, sectionId, student)).toBeNull();
    });
  });

  it("stamps completed_at when the last required item is completed", async () => {
    await withRollback(async (db) => {
      const { student, sectionId, itemIds } = await seedClassroom(db);
      for (const id of itemIds) await completeItem(db, id, student);
      expect(await completedAt(db, sectionId, student)).not.toBeNull();
    });
  });

  it("ignores optional items", async () => {
    await withRollback(async (db) => {
      const { student, sectionId, moduleId, itemIds } = await seedClassroom(db);
      await seedItem(db, moduleId, { position: 9, required: false });
      for (const id of itemIds) await completeItem(db, id, student);
      expect(await completedAt(db, sectionId, student)).not.toBeNull();
    });
  });

  it("clears completed_at when progress is withdrawn", async () => {
    await withRollback(async (db) => {
      const { student, sectionId, itemIds } = await seedClassroom(db);
      for (const id of itemIds) await completeItem(db, id, student);
      await db.seed("delete from public.module_item_progress where item_id = $1 and student_id = $2", [
        itemIds[2],
        student,
      ]);
      expect(await completedAt(db, sectionId, student)).toBeNull();
    });
  });

  it("does not affect a classmate's enrollment", async () => {
    await withRollback(async (db) => {
      const { student, schoolId, sectionId, itemIds } = await seedClassroom(db);
      const mate = await db.createUser({ email: "mate@s1.test" });
      await addMember(db, schoolId, mate, "student");
      await enrollStudent(db, sectionId, mate);
      for (const id of itemIds) await completeItem(db, id, student);
      expect(await completedAt(db, sectionId, student)).not.toBeNull();
      expect(await completedAt(db, sectionId, mate)).toBeNull();
    });
  });

  it("reopens a finished enrollment when a required item is added", async () => {
    await withRollback(async (db) => {
      const { student, sectionId, moduleId, itemIds } = await seedClassroom(db);
      for (const id of itemIds) await completeItem(db, id, student);
      expect(await completedAt(db, sectionId, student)).not.toBeNull();
      await seedItem(db, moduleId, { position: 9 });
      expect(await completedAt(db, sectionId, student)).toBeNull();
    });
  });

  it("does not reopen it for an optional or unpublished item", async () => {
    await withRollback(async (db) => {
      const { student, sectionId, moduleId, itemIds } = await seedClassroom(db);
      for (const id of itemIds) await completeItem(db, id, student);
      await seedItem(db, moduleId, { position: 8, required: false });
      await seedItem(db, moduleId, { position: 9, published: false });
      expect(await completedAt(db, sectionId, student)).not.toBeNull();
    });
  });
});

describe("completion cannot be written by hand", () => {
  it("ignores a completion stamp from a student, a teacher or an admin", async () => {
    // Even the roles allowed to update enrollments do not get to decide this
    // column; the trigger derives it and the guard keeps everyone else out.
    await withRollback(async (db) => {
      const { student, teacher, admin, sectionId } = await seedClassroom(db);

      for (const who of [teacher, admin]) {
        const result = await db.asUser(who, (q) =>
          q.attempt(
            `update public.section_enrollments set completed_at = now()
             where section_id = $1 and profile_id = $2 returning completed_at`,
            [sectionId, student],
          ),
        );
        // The update may succeed, but the stamp does not take.
        expect(result.ok ? result.rows[0] : { completed_at: null }).toMatchObject({
          completed_at: null,
        });
      }

      const byStudent = await db.asUser(student, (q) =>
        q.attempt(
          `update public.section_enrollments set completed_at = now()
           where section_id = $1 and profile_id = $2 returning id`,
          [sectionId, student],
        ),
      );
      expect(byStudent.ok && byStudent.rows.length > 0).toBe(false);
      expect(await completedAt(db, sectionId, student)).toBeNull();
    });
  });

  it("drops a completion stamp supplied on insert", async () => {
    await withRollback(async (db) => {
      const { admin, schoolId, sectionId } = await seedClassroom(db);
      const kid = await db.createUser({ email: "kid2@s1.test" });
      await addMember(db, schoolId, kid, "student");
      const [row] = await db.asUser(admin, (q) =>
        q.run<{ completed_at: string | null }>(
          `insert into public.section_enrollments (section_id, profile_id, role, completed_at)
           values ($1, $2, 'student', now()) returning completed_at`,
          [sectionId, kid],
        ),
      );
      expect(row.completed_at).toBeNull();
    });
  });
});
