import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback } from "./harness";
import { addMember, seedClassroom, seedCourse, seedModule, seedSection } from "./fixtures";

beforeAll(connect);
afterAll(disconnect);

/**
 * Who may build a class: modules and items belong to the section's teachers
 * and the school's admins; a section's shape and a school's details have
 * their own owners. Content *reading* is covered by item-access.test.ts.
 */

const insertModule = `insert into public.modules (section_id, title, position)
                      values ($1, $2, $3) returning id`;
const insertItem = `insert into public.module_items (module_id, position, title)
                    values ($1, $2, 'New page') returning id`;

describe("modules", () => {
  it("are added, edited and removed by the section's teacher and the school's admin", async () => {
    await withRollback(async (db) => {
      const { admin, teacher, sectionId } = await seedClassroom(db);
      for (const [who, position] of [
        [teacher, 10],
        [admin, 11],
      ] as const) {
        const [created] = await db.asUser(who, (q) =>
          q.run<{ id: string }>(insertModule, [sectionId, "Unit", position]),
        );
        const renamed = await db.asUser(who, (q) =>
          q.run("update public.modules set title = 'Renamed' where id = $1 returning title", [created.id]),
        );
        expect(renamed).toEqual([{ title: "Renamed" }]);
        const deleted = await db.asUser(who, (q) =>
          q.run("delete from public.modules where id = $1 returning id", [created.id]),
        );
        expect(deleted).toHaveLength(1);
      }
    });
  });

  it("cannot be touched by a student, a colleague, or an aide", async () => {
    await withRollback(async (db) => {
      const { student, sectionId, moduleId, schoolId } = await seedClassroom(db);
      const colleague = await db.createUser({ email: "colleague@s1.test" });
      await addMember(db, schoolId, colleague, "teacher");
      const aide = await db.createUser({ email: "aide@s1.test" });
      await addMember(db, schoolId, aide, "teacher");
      await db.seed(
        "insert into public.section_enrollments (section_id, profile_id, role) values ($1, $2, 'aide')",
        [sectionId, aide],
      );

      for (const who of [student, colleague, aide]) {
        const insert = await db.asUser(who, (q) => q.attempt(insertModule, [sectionId, "Rogue", 50]));
        expect(insert.ok).toBe(false);
        expect(insert.error).toMatch(/row-level security/i);

        const update = await db.asUser(who, (q) =>
          q.run("update public.modules set title = 'Rogue' where id = $1 returning id", [moduleId]),
        );
        expect(update).toHaveLength(0);

        const remove = await db.asUser(who, (q) =>
          q.run("delete from public.modules where id = $1 returning id", [moduleId]),
        );
        expect(remove).toHaveLength(0);
      }
      // Nothing changed underneath them.
      const [row] = await db.seed<{ title: string }>("select title from public.modules where id = $1", [moduleId]);
      expect(row.title).toBe("Unit 1");
    });
  });

  it("let a co-teacher author alongside the teacher", async () => {
    await withRollback(async (db) => {
      const { sectionId, schoolId } = await seedClassroom(db);
      const coTeacher = await db.createUser({ email: "co@s1.test" });
      await addMember(db, schoolId, coTeacher, "teacher");
      await db.seed(
        "insert into public.section_enrollments (section_id, profile_id, role) values ($1, $2, 'co_teacher')",
        [sectionId, coTeacher],
      );
      const [created] = await db.asUser(coTeacher, (q) =>
        q.run<{ id: string }>(insertModule, [sectionId, "Unit 2", 2]),
      );
      expect(created.id).toBeTruthy();
    });
  });

  it("may only require a prerequisite from the same section, and never themselves", async () => {
    await withRollback(async (db) => {
      const { teacher, courseId, termId, sectionId, moduleId } = await seedClassroom(db);
      const otherSection = await seedSection(db, { courseId, termId, teacherId: teacher, name: "Period 2" });
      const foreign = await seedModule(db, otherSection, { title: "Elsewhere" });

      const crossSection = await db.asUser(teacher, (q) =>
        q.attempt("update public.modules set prerequisite_module_id = $1 where id = $2", [foreign, moduleId]),
      );
      expect(crossSection.ok).toBe(false);
      expect(crossSection.error).toMatch(/same section/i);

      const self = await db.asUser(teacher, (q) =>
        q.attempt("update public.modules set prerequisite_module_id = $1 where id = $1", [moduleId]),
      );
      expect(self.ok).toBe(false);

      const second = await seedModule(db, sectionId, { title: "Unit 2", position: 2 });
      const valid = await db.asUser(teacher, (q) =>
        q.run("update public.modules set prerequisite_module_id = $1 where id = $2 returning id", [
          moduleId,
          second,
        ]),
      );
      expect(valid).toHaveLength(1);
    });
  });

  it("keep their positions unique within a section", async () => {
    await withRollback(async (db) => {
      const { teacher, sectionId } = await seedClassroom(db);
      const result = await db.asUser(teacher, (q) => q.attempt(insertModule, [sectionId, "Dup", 1]));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/unique/i);
    });
  });
});

describe("items", () => {
  it("are authored by the section's teacher and admin, not by its students or an aide", async () => {
    await withRollback(async (db) => {
      const { admin, teacher, student, moduleId, itemIds, sectionId, schoolId } = await seedClassroom(db);
      const aide = await db.createUser({ email: "aide@s1.test" });
      await addMember(db, schoolId, aide, "teacher");
      await db.seed(
        "insert into public.section_enrollments (section_id, profile_id, role) values ($1, $2, 'aide')",
        [sectionId, aide],
      );

      for (const who of [student, aide]) {
        const insert = await db.asUser(who, (q) => q.attempt(insertItem, [moduleId, 50]));
        expect(insert.ok).toBe(false);
        const update = await db.asUser(who, (q) =>
          q.run("update public.module_items set content = 'graffiti' where id = $1 returning id", [itemIds[0]]),
        );
        expect(update).toHaveLength(0);
        const remove = await db.asUser(who, (q) =>
          q.run("delete from public.module_items where id = $1 returning id", [itemIds[0]]),
        );
        expect(remove).toHaveLength(0);
      }

      const [byTeacher] = await db.asUser(teacher, (q) => q.run<{ id: string }>(insertItem, [moduleId, 51]));
      const [byAdmin] = await db.asUser(admin, (q) => q.run<{ id: string }>(insertItem, [moduleId, 52]));
      for (const [who, id] of [
        [teacher, byTeacher.id],
        [admin, byAdmin.id],
      ] as const) {
        const edited = await db.asUser(who, (q) =>
          q.run("update public.module_items set published = false where id = $1 returning published", [id]),
        );
        expect(edited).toEqual([{ published: false }]);
        const deleted = await db.asUser(who, (q) =>
          q.run("delete from public.module_items where id = $1 returning id", [id]),
        );
        expect(deleted).toHaveLength(1);
      }
    });
  });

  it("cannot be added to a colleague's module", async () => {
    await withRollback(async (db) => {
      const { moduleId, schoolId } = await seedClassroom(db);
      const colleague = await db.createUser({ email: "colleague@s1.test" });
      await addMember(db, schoolId, colleague, "teacher");
      const result = await db.asUser(colleague, (q) => q.attempt(insertItem, [moduleId, 60]));
      expect(result.ok).toBe(false);
    });
  });

  it("validate their own fields", async () => {
    await withRollback(async (db) => {
      const { teacher, moduleId } = await seedClassroom(db);
      const badMark = await db.asUser(teacher, (q) =>
        q.attempt(
          "insert into public.module_items (module_id, position, title, pass_mark) values ($1, 70, 'x', 101)",
          [moduleId],
        ),
      );
      expect(badMark.ok).toBe(false);
      const negativeDuration = await db.asUser(teacher, (q) =>
        q.attempt(
          "insert into public.module_items (module_id, position, title, duration_minutes) values ($1, 71, 'x', -1)",
          [moduleId],
        ),
      );
      expect(negativeDuration.ok).toBe(false);
    });
  });
});

describe("sections", () => {
  it("can be renamed or archived by their teacher, but deleted only by an admin", async () => {
    await withRollback(async (db) => {
      const { admin, teacher, student, sectionId, schoolId } = await seedClassroom(db);
      const colleague = await db.createUser({ email: "colleague@s1.test" });
      await addMember(db, schoolId, colleague, "teacher");

      for (const who of [student, colleague]) {
        const rows = await db.asUser(who, (q) =>
          q.run("update public.sections set name = 'Rogue' where id = $1 returning id", [sectionId]),
        );
        expect(rows).toHaveLength(0);
      }

      const renamed = await db.asUser(teacher, (q) =>
        q.run("update public.sections set name = 'Period 9' where id = $1 returning name", [sectionId]),
      );
      expect(renamed).toEqual([{ name: "Period 9" }]);
      const archived = await db.asUser(teacher, (q) =>
        q.run("update public.sections set status = 'archived' where id = $1 returning status", [sectionId]),
      );
      expect(archived).toEqual([{ status: "archived" }]);

      const deletedByTeacher = await db.asUser(teacher, (q) =>
        q.run("delete from public.sections where id = $1 returning id", [sectionId]),
      );
      expect(deletedByTeacher).toHaveLength(0);
      const deletedByAdmin = await db.asUser(admin, (q) =>
        q.run("delete from public.sections where id = $1 returning id", [sectionId]),
      );
      expect(deletedByAdmin).toHaveLength(1);
    });
  });

  it("cannot be moved to a course at another school", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });
      const result = await db.asUser(a.teacher, (q) =>
        q.attempt("update public.sections set course_id = $1 where id = $2", [b.courseId, a.sectionId]),
      );
      expect(result.ok).toBe(false);
    });
  });

  it("are created only through create_section(), never by a direct insert from a teacher", async () => {
    // The RPC is what enrols the teacher; a direct insert would leave a
    // section nobody teaches.
    await withRollback(async (db) => {
      const { teacher, courseId, termId, schoolId } = await seedClassroom(db);
      const result = await db.asUser(teacher, (q) =>
        q.attempt(
          "insert into public.sections (school_id, course_id, term_id, name) values ($1, $2, $3, 'Direct')",
          [schoolId, courseId, termId],
        ),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/row-level security/i);
    });
  });
});

describe("a school's own details", () => {
  it("are edited by its admins only, and read by every member", async () => {
    await withRollback(async (db) => {
      const { admin, teacher, student, schoolId } = await seedClassroom(db);
      for (const who of [teacher, student]) {
        const rows = await db.asUser(who, (q) =>
          q.run("update public.schools set name = 'Rogue' where id = $1 returning id", [schoolId]),
        );
        expect(rows).toHaveLength(0);
        const visible = await db.asUser(who, (q) =>
          q.run("select name from public.schools where id = $1", [schoolId]),
        );
        expect(visible).toHaveLength(1);
      }
      const renamed = await db.asUser(admin, (q) =>
        q.run("update public.schools set name = 'Renamed', timezone = 'America/New_York' where id = $1 returning name", [
          schoolId,
        ]),
      );
      expect(renamed).toEqual([{ name: "Renamed" }]);
    });
  });

  it("keep grade_min at or below grade_max", async () => {
    await withRollback(async (db) => {
      const { admin, schoolId } = await seedClassroom(db);
      const result = await db.asUser(admin, (q) =>
        q.attempt("update public.schools set grade_min = 9, grade_max = 5 where id = $1", [schoolId]),
      );
      expect(result.ok).toBe(false);
    });
  });
});

describe("organisations", () => {
  it("are visible to members of their schools, editable by their admins, and hidden from everyone else", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });

      for (const who of [a.admin, a.teacher, a.student]) {
        const rows = await db.asUser(who, (q) =>
          q.run("select id from public.organizations where id = $1", [a.orgId]),
        );
        expect(rows).toHaveLength(1);
      }
      const outsider = await db.asUser(b.admin, (q) =>
        q.run("select id from public.organizations where id = $1", [a.orgId]),
      );
      expect(outsider).toHaveLength(0);

      const byTeacher = await db.asUser(a.teacher, (q) =>
        q.run("update public.organizations set name = 'Rogue' where id = $1 returning id", [a.orgId]),
      );
      expect(byTeacher).toHaveLength(0);
      const byAdmin = await db.asUser(a.admin, (q) =>
        q.run("update public.organizations set name = 'District 9' where id = $1 returning name", [a.orgId]),
      );
      expect(byAdmin).toEqual([{ name: "District 9" }]);
    });
  });

  it("cannot gain an admin who merely administers one of their schools", async () => {
    // A school admin appointed by invitation is not a district admin; they
    // must not be able to grant themselves the organisation.
    await withRollback(async (db) => {
      const { schoolId, orgId } = await seedClassroom(db);
      const schoolAdmin = await db.createUser({ email: "principal@s1.test" });
      await addMember(db, schoolId, schoolAdmin, "school_admin");

      const result = await db.asUser(schoolAdmin, (q) =>
        q.attempt(
          "insert into public.organization_memberships (organization_id, profile_id) values ($1, $2)",
          [orgId, schoolAdmin],
        ),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/row-level security/i);

      const rows = await db.asUser(schoolAdmin, (q) =>
        q.run("select id from public.organization_memberships where organization_id = $1", [orgId]),
      );
      expect(rows).toHaveLength(0);
    });
  });
});

describe("courses", () => {
  it("cannot be re-homed to another school", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });
      const mine = await seedCourse(db, a.schoolId, { createdBy: a.teacher, title: "Mine" });
      const result = await db.asUser(a.teacher, (q) =>
        q.attempt("update public.courses set school_id = $1 where id = $2", [b.schoolId, mine]),
      );
      expect(result.ok).toBe(false);
    });
  });
});
