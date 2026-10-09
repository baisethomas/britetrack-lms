import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback } from "./harness";
import { answerPayload, completeItem, seedClassroom, seedQuizItem } from "./fixtures";

beforeAll(connect);
afterAll(disconnect);

/**
 * Properties every table and function must keep as the schema grows. A new
 * migration that adds a table without RLS, or a definer function without a
 * pinned search_path, fails here before any policy test has to notice.
 */

async function publicTables(db: Parameters<Parameters<typeof withRollback>[0]>[0]): Promise<string[]> {
  const rows = await db.seed<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  return rows.map((r) => r.tablename);
}

describe("schema invariants", () => {
  it("has row level security enabled on every public table", async () => {
    await withRollback(async (db) => {
      const rows = await db.seed<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = 'public' and not rowsecurity",
      );
      expect(rows.map((r) => r.tablename)).toEqual([]);
    });
  });

  it("has at least one policy on every public table", async () => {
    await withRollback(async (db) => {
      const rows = await db.seed<{ tablename: string }>(
        `select t.tablename
         from pg_tables t
         left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
         where t.schemaname = 'public'
         group by t.tablename
         having count(p.policyname) = 0`,
      );
      expect(rows.map((r) => r.tablename)).toEqual([]);
    });
  });

  it("pins search_path on every security definer function", async () => {
    // A definer function without a fixed search_path can be made to call an
    // attacker's function of the same name from another schema.
    await withRollback(async (db) => {
      const rows = await db.seed<{ proname: string }>(
        `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.prosecdef
           and not exists (
             select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
           )`,
      );
      expect(rows.map((r) => r.proname)).toEqual([]);
    });
  });

  it("shows an anonymous caller no rows in any table, even when every table has data", async () => {
    await withRollback(async (db) => {
      const room = await seedClassroom(db);
      const quiz = await seedQuizItem(db, room.moduleId);
      // Work through the module so a graded attempt (and its answers) exist.
      for (const itemId of room.itemIds) await completeItem(db, itemId, room.student);
      await db.asUser(room.student, (q) =>
        q.run("select public.submit_quiz_attempt($1, $2::jsonb)", [
          quiz.itemId,
          answerPayload(quiz.questionIds, quiz.correctIds),
        ]),
      );
      await db.seed("insert into public.notifications (user_id, title) values ($1, 'hi')", [room.student]);
      await db.seed(
        "insert into public.live_sessions (section_id, title, starts_at) values ($1, 'Live', now())",
        [room.sectionId],
      );
      await db.seed("insert into public.guardian_links (guardian_id, student_id) values ($1, $2)", [
        room.teacher,
        room.student,
      ]);
      await db.seed(
        "insert into public.invitations (school_id, email, role) values ($1, 'x@y.test', 'teacher')",
        [room.schoolId],
      );
      await db.seed(
        `insert into public.grading_periods (term_id, name, starts_on, ends_on)
         values ($1, 'Q1', current_date, current_date + 30)`,
        [room.termId],
      );

      const tables = await publicTables(db);
      expect(tables.length).toBeGreaterThanOrEqual(22);

      const leaks: string[] = [];
      for (const table of tables) {
        const [{ n }] = await db.seed<{ n: number }>(`select count(*)::int as n from public.${table}`);
        expect(n, `${table} should be seeded`).toBeGreaterThan(0);

        const result = await db.asAnon((q) =>
          q.attempt<{ n: number }>(`select count(*)::int as n from public.${table}`),
        );
        // Either the table is not granted to anon at all, or RLS hides every row.
        if (result.ok && result.rows[0].n !== 0) leaks.push(table);
        if (!result.ok && !/permission denied/i.test(result.error ?? "")) leaks.push(table);
      }
      expect(leaks).toEqual([]);
    });
  });

  it("keeps updated_at current on every table that carries it", async () => {
    await withRollback(async (db) => {
      const room = await seedClassroom(db);
      const targets: [string, string, string][] = [
        ["organizations", "id", room.orgId],
        ["schools", "id", room.schoolId],
        ["profiles", "id", room.student],
        ["students", "profile_id", room.student],
        ["courses", "id", room.courseId],
        ["sections", "id", room.sectionId],
        ["modules", "id", room.moduleId],
        ["module_items", "id", room.itemIds[0]],
      ];
      for (const [table, key, id] of targets) {
        await db.seed(`update public.${table} set updated_at = now() - interval '1 day' where ${key} = $1`, [id]);
        // Touch a column every table has a trigger for; the trigger overrides
        // whatever updated_at the statement set.
        await db.seed(
          `update public.${table} set updated_at = now() - interval '2 days' where ${key} = $1`,
          [id],
        );
        const [row] = await db.seed<{ fresh: boolean }>(
          `select updated_at = now() as fresh from public.${table} where ${key} = $1`,
          [id],
        );
        expect(row.fresh, table).toBe(true);
      }
    });
  });
});
