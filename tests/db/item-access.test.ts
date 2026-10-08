import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback } from "./harness";
import {
  addMember,
  completeItem,
  enrollStudent,
  linkGuardian,
  seedClassroom,
  seedItem,
  seedModule,
  seedSection,
} from "./fixtures";

beforeAll(connect);
afterAll(disconnect);

const CONTENT = "select content from public.module_items where id = $1";

describe("item content visibility", () => {
  it("hides content from a student who is not in the section", async () => {
    await withRollback(async (db) => {
      const { schoolId, itemIds } = await seedClassroom(db);
      const other = await db.createUser({ email: "other@s1.test" });
      await addMember(db, schoolId, other, "student");
      const rows = await db.asUser(other, (q) => q.run(CONTENT, [itemIds[0]]));
      expect(rows).toHaveLength(0);
    });
  });

  it("opens only the first item of a sequential module to a new student", async () => {
    await withRollback(async (db) => {
      const { student, itemIds } = await seedClassroom(db);
      const first = await db.asUser(student, (q) =>
        q.run<{ content: string }>(CONTENT, [itemIds[0]]),
      );
      expect(first[0]?.content).toBe("secret body 1");
      const second = await db.asUser(student, (q) => q.run(CONTENT, [itemIds[1]]));
      expect(second).toHaveLength(0);
    });
  });

  it("opens the next item once the previous one is complete", async () => {
    await withRollback(async (db) => {
      const { student, itemIds } = await seedClassroom(db);
      await completeItem(db, itemIds[0], student);
      const second = await db.asUser(student, (q) =>
        q.run<{ content: string }>(CONTENT, [itemIds[1]]),
      );
      expect(second[0]?.content).toBe("secret body 2");
      const third = await db.asUser(student, (q) => q.run(CONTENT, [itemIds[2]]));
      expect(third).toHaveLength(0);
    });
  });

  it("does not let an optional item block the ones after it", async () => {
    await withRollback(async (db) => {
      const { student, moduleId } = await seedClassroom(db, { itemCount: 1 });
      const optional = await seedItem(db, moduleId, { position: 2, required: false });
      const after = await seedItem(db, moduleId, { position: 3 });
      await completeItem(db, (await firstItem(db, moduleId)), student);

      const rows = await db.asUser(student, (q) =>
        q.run<{ id: string }>("select id from public.module_items where id in ($1, $2)", [
          optional,
          after,
        ]),
      );
      expect(rows).toHaveLength(2);
    });
  });

  it("opens every item of a free module at once", async () => {
    await withRollback(async (db) => {
      const { student, itemIds } = await seedClassroom(db, { unlock: "free" });
      const rows = await db.asUser(student, (q) =>
        q.run<{ id: string }>("select id from public.module_items"),
      );
      expect(rows.map((r) => r.id).sort()).toEqual([...itemIds].sort());
    });
  });

  it("gates a module on its prerequisite module", async () => {
    await withRollback(async (db) => {
      const { student, sectionId, moduleId, itemIds } = await seedClassroom(db, {
        itemCount: 1,
        unlock: "free",
      });
      const unit2 = await seedModule(db, sectionId, {
        position: 2,
        unlock: "free",
        prerequisiteId: moduleId,
      });
      const gated = await seedItem(db, unit2, { position: 1 });

      const before = await db.asUser(student, (q) => q.run(CONTENT, [gated]));
      expect(before).toHaveLength(0);

      await completeItem(db, itemIds[0], student);
      const after = await db.asUser(student, (q) => q.run(CONTENT, [gated]));
      expect(after).toHaveLength(1);
    });
  });

  it("hides unpublished modules, unpublished items and archived sections", async () => {
    await withRollback(async (db) => {
      const { student, sectionId, moduleId, itemIds } = await seedClassroom(db, {
        itemCount: 1,
        unlock: "free",
      });
      const draftItem = await seedItem(db, moduleId, { position: 2, published: false });
      const draftModule = await seedModule(db, sectionId, { position: 2, published: false });
      const inDraft = await seedItem(db, draftModule, { position: 1 });

      for (const id of [draftItem, inDraft]) {
        const rows = await db.asUser(student, (q) => q.run(CONTENT, [id]));
        expect(rows).toHaveLength(0);
      }

      await db.seed("update public.sections set status = 'archived' where id = $1", [sectionId]);
      const archived = await db.asUser(student, (q) => q.run(CONTENT, [itemIds[0]]));
      expect(archived).toHaveLength(0);
    });
  });

  it("gives the section's teacher every item, locked or draft", async () => {
    await withRollback(async (db) => {
      const { teacher, moduleId, itemIds } = await seedClassroom(db);
      const draft = await seedItem(db, moduleId, { position: 9, published: false });
      const rows = await db.asUser(teacher, (q) =>
        q.run<{ id: string }>("select id from public.module_items"),
      );
      expect(rows.map((r) => r.id).sort()).toEqual([...itemIds, draft].sort());
    });
  });

  it("gives a school admin every item without an enrollment", async () => {
    await withRollback(async (db) => {
      const { admin, itemIds } = await seedClassroom(db);
      const rows = await db.asUser(admin, (q) =>
        q.run<{ id: string }>("select id from public.module_items"),
      );
      expect(rows).toHaveLength(itemIds.length);
    });
  });

  it("keeps item bodies from guardians; they browse the catalog instead", async () => {
    await withRollback(async (db) => {
      const { student, schoolId, itemIds } = await seedClassroom(db);
      const guardian = await db.createUser({ email: "guardian@s1.test" });
      await addMember(db, schoolId, guardian, "guardian");
      await linkGuardian(db, guardian, student);

      const bodies = await db.asUser(guardian, (q) => q.run(CONTENT, [itemIds[0]]));
      expect(bodies).toHaveLength(0);
      const catalog = await db.asUser(guardian, (q) =>
        q.run<{ id: string }>("select id from public.module_item_catalog"),
      );
      expect(catalog).toHaveLength(itemIds.length);
    });
  });
});

describe("module_item_catalog view", () => {
  it("shows a student every published item in their sections, locked ones included", async () => {
    await withRollback(async (db) => {
      const { student, itemIds } = await seedClassroom(db);
      const rows = await db.asUser(student, (q) =>
        q.run<{ id: string }>("select id from public.module_item_catalog order by position"),
      );
      expect(rows.map((r) => r.id)).toEqual(itemIds);
    });
  });

  it("does not expose bodies or video URLs", async () => {
    await withRollback(async (db) => {
      const { student } = await seedClassroom(db);
      const columns = await db.asUser(student, (q) =>
        q.run<{ column_name: string }>(
          `select column_name from information_schema.columns
           where table_schema = 'public' and table_name = 'module_item_catalog'`,
        ),
      );
      const names = columns.map((c) => c.column_name);
      expect(names).not.toContain("content");
      expect(names).not.toContain("video_url");
      expect(names).not.toContain("url");
      expect(names).toContain("title");
    });
  });

  it("omits unpublished items from students but not from staff", async () => {
    await withRollback(async (db) => {
      const { student, teacher, moduleId, itemIds } = await seedClassroom(db);
      const draft = await seedItem(db, moduleId, { position: 9, published: false });

      const forStudent = await db.asUser(student, (q) =>
        q.run<{ id: string }>("select id from public.module_item_catalog"),
      );
      expect(forStudent.map((r) => r.id)).not.toContain(draft);

      const forTeacher = await db.asUser(teacher, (q) =>
        q.run<{ id: string }>("select id from public.module_item_catalog"),
      );
      expect(forTeacher).toHaveLength(itemIds.length + 1);
    });
  });

  it("is not readable anonymously", async () => {
    await withRollback(async (db) => {
      await seedClassroom(db);
      const result = await db.asAnon((q) => q.attempt("select id from public.module_item_catalog"));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/permission denied/i);
    });
  });
});

describe("progress writes", () => {
  it("lets a student start and complete the open item", async () => {
    await withRollback(async (db) => {
      const { student, itemIds } = await seedClassroom(db);
      const started = await db.asUser(student, (q) =>
        q.run<{ id: string }>(
          `insert into public.module_item_progress (item_id, student_id)
           values ($1, $2) returning id`,
          [itemIds[0], student],
        ),
      );
      expect(started).toHaveLength(1);
      const done = await db.asUser(student, (q) =>
        q.run<{ id: string }>(
          `update public.module_item_progress set completed_at = now()
           where item_id = $1 and student_id = $2 returning id`,
          [itemIds[0], student],
        ),
      );
      expect(done).toHaveLength(1);
    });
  });

  it("blocks completing a locked item", async () => {
    await withRollback(async (db) => {
      const { student, itemIds } = await seedClassroom(db);
      const result = await db.asUser(student, (q) =>
        q.attempt(
          `insert into public.module_item_progress (item_id, student_id, completed_at)
           values ($1, $2, now()) returning id`,
          [itemIds[1], student],
        ),
      );
      expect(result.ok && result.rows.length > 0).toBe(false);
    });
  });

  it("blocks progress on a section the student is not in", async () => {
    await withRollback(async (db) => {
      const { schoolId, itemIds } = await seedClassroom(db);
      const other = await db.createUser({ email: "other@s1.test" });
      await addMember(db, schoolId, other, "student");
      const result = await db.asUser(other, (q) =>
        q.attempt(
          `insert into public.module_item_progress (item_id, student_id, completed_at)
           values ($1, $2, now()) returning id`,
          [itemIds[0], other],
        ),
      );
      expect(result.ok && result.rows.length > 0).toBe(false);
    });
  });

  it("blocks recording progress on behalf of another student", async () => {
    await withRollback(async (db) => {
      const { student, schoolId, sectionId, itemIds } = await seedClassroom(db);
      const other = await db.createUser({ email: "other@s1.test" });
      await addMember(db, schoolId, other, "student");
      await enrollStudent(db, sectionId, other);
      const result = await db.asUser(student, (q) =>
        q.attempt(
          `insert into public.module_item_progress (item_id, student_id, completed_at)
           values ($1, $2, now()) returning id`,
          [itemIds[0], other],
        ),
      );
      expect(result.ok && result.rows.length > 0).toBe(false);
    });
  });

  it("blocks re-pointing an existing progress row at a locked item", async () => {
    await withRollback(async (db) => {
      const { student, itemIds } = await seedClassroom(db);
      await completeItem(db, itemIds[0], student);
      const result = await db.asUser(student, (q) =>
        q.attempt(
          `update public.module_item_progress set item_id = $1
           where item_id = $2 and student_id = $3 returning id`,
          [itemIds[2], itemIds[0], student],
        ),
      );
      expect(result.ok && result.rows.length > 0).toBe(false);
    });
  });

  it("shows progress to the student, their guardian and their teacher, not to a classmate", async () => {
    await withRollback(async (db) => {
      const { student, teacher, schoolId, sectionId, itemIds } = await seedClassroom(db);
      await completeItem(db, itemIds[0], student);
      const guardian = await db.createUser({ email: "guardian@s1.test" });
      await addMember(db, schoolId, guardian, "guardian");
      await linkGuardian(db, guardian, student);
      const classmate = await db.createUser({ email: "mate@s1.test" });
      await addMember(db, schoolId, classmate, "student");
      await enrollStudent(db, sectionId, classmate);

      for (const who of [student, guardian, teacher]) {
        const rows = await db.asUser(who, (q) =>
          q.run<{ id: string }>(
            "select id from public.module_item_progress where student_id = $1",
            [student],
          ),
        );
        expect(rows).toHaveLength(1);
      }
      const hidden = await db.asUser(classmate, (q) =>
        q.run<{ id: string }>("select id from public.module_item_progress where student_id = $1", [
          student,
        ]),
      );
      expect(hidden).toHaveLength(0);
    });
  });
});

async function firstItem(
  db: Awaited<Parameters<Parameters<typeof withRollback>[0]>[0]>,
  moduleId: string,
): Promise<string> {
  const [row] = await db.seed<{ id: string }>(
    "select id from public.module_items where module_id = $1 order by position limit 1",
    [moduleId],
  );
  return row.id;
}

void seedSection;
