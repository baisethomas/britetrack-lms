import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback } from "./harness";
import { seedClassroom } from "./fixtures";

beforeAll(connect);
afterAll(disconnect);

describe("terms", () => {
  it("are readable by every member of the school and by nobody elsewhere", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });
      for (const who of [a.admin, a.teacher, a.student]) {
        const rows = await db.asUser(who, (q) =>
          q.run("select id from public.terms where school_id = $1", [a.schoolId]),
        );
        expect(rows).toHaveLength(1);
      }
      for (const who of [b.admin, b.teacher, b.student]) {
        const rows = await db.asUser(who, (q) =>
          q.run("select id from public.terms where school_id = $1", [a.schoolId]),
        );
        expect(rows).toHaveLength(0);
      }
    });
  });

  it("are added, renamed and removed by the school's admins only", async () => {
    await withRollback(async (db) => {
      const { admin, teacher, student, schoolId } = await seedClassroom(db);
      const insert = `insert into public.terms (school_id, name, starts_on, ends_on)
                      values ($1, 'Spring', current_date + 150, current_date + 300) returning id`;

      for (const who of [teacher, student]) {
        const result = await db.asUser(who, (q) => q.attempt(insert, [schoolId]));
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/row-level security/i);
      }

      const [created] = await db.asUser(admin, (q) => q.run<{ id: string }>(insert, [schoolId]));

      const renamedByTeacher = await db.asUser(teacher, (q) =>
        q.run("update public.terms set name = 'Hacked' where id = $1 returning id", [created.id]),
      );
      expect(renamedByTeacher).toHaveLength(0);

      const renamedByAdmin = await db.asUser(admin, (q) =>
        q.run("update public.terms set name = 'Spring 2027' where id = $1 returning name", [created.id]),
      );
      expect(renamedByAdmin).toEqual([{ name: "Spring 2027" }]);

      const deletedByTeacher = await db.asUser(teacher, (q) =>
        q.run("delete from public.terms where id = $1 returning id", [created.id]),
      );
      expect(deletedByTeacher).toHaveLength(0);
      const deletedByAdmin = await db.asUser(admin, (q) =>
        q.run("delete from public.terms where id = $1 returning id", [created.id]),
      );
      expect(deletedByAdmin).toHaveLength(1);
    });
  });

  it("cannot be added to another school by its admin", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });
      const result = await db.asUser(b.admin, (q) =>
        q.attempt(
          `insert into public.terms (school_id, name, starts_on, ends_on)
           values ($1, 'Intruder', current_date, current_date + 10)`,
          [a.schoolId],
        ),
      );
      expect(result.ok).toBe(false);
    });
  });

  it("must end after they start", async () => {
    await withRollback(async (db) => {
      const { admin, schoolId } = await seedClassroom(db);
      for (const days of [0, -5]) {
        const result = await db.asUser(admin, (q) =>
          q.attempt(
            `insert into public.terms (school_id, name, starts_on, ends_on)
             values ($1, 'Bad', current_date, current_date + $2::int)`,
            [schoolId, days],
          ),
        );
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/check constraint/i);
      }
    });
  });

  it("cannot be deleted while a section still runs in them", async () => {
    // Sections reference their term with ON DELETE RESTRICT: a term with
    // classes in it is history, not clutter.
    await withRollback(async (db) => {
      const { admin, termId } = await seedClassroom(db);
      const result = await db.asUser(admin, (q) =>
        q.attempt("delete from public.terms where id = $1", [termId]),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/foreign key|violates/i);
    });
  });
});

describe("grading periods", () => {
  it("follow their term: members read them, admins manage them", async () => {
    await withRollback(async (db) => {
      const a = await seedClassroom(db, { tag: "a" });
      const b = await seedClassroom(db, { tag: "b" });
      const insert = `insert into public.grading_periods (term_id, name, starts_on, ends_on)
                      values ($1, 'Q1', current_date, current_date + 45) returning id`;

      const byTeacher = await db.asUser(a.teacher, (q) => q.attempt(insert, [a.termId]));
      expect(byTeacher.ok).toBe(false);
      const byOtherAdmin = await db.asUser(b.admin, (q) => q.attempt(insert, [a.termId]));
      expect(byOtherAdmin.ok).toBe(false);

      const [period] = await db.asUser(a.admin, (q) => q.run<{ id: string }>(insert, [a.termId]));

      for (const who of [a.teacher, a.student]) {
        const rows = await db.asUser(who, (q) =>
          q.run("select id from public.grading_periods where id = $1", [period.id]),
        );
        expect(rows).toHaveLength(1);
      }
      const outsider = await db.asUser(b.student, (q) =>
        q.run("select id from public.grading_periods where id = $1", [period.id]),
      );
      expect(outsider).toHaveLength(0);

      const edited = await db.asUser(a.teacher, (q) =>
        q.run("update public.grading_periods set name = 'X' where id = $1 returning id", [period.id]),
      );
      expect(edited).toHaveLength(0);
    });
  });

  it("must end after they start", async () => {
    await withRollback(async (db) => {
      const { admin, termId } = await seedClassroom(db);
      const result = await db.asUser(admin, (q) =>
        q.attempt(
          `insert into public.grading_periods (term_id, name, starts_on, ends_on)
           values ($1, 'Bad', current_date, current_date)`,
          [termId],
        ),
      );
      expect(result.ok).toBe(false);
    });
  });
});
