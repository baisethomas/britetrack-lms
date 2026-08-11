import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, withRollback } from "./harness";

beforeAll(connect);
afterAll(disconnect);

describe("signup role assignment", () => {
  it("honours a self-service student role", async () => {
    await withRollback(async (db) => {
      const id = await db.createUser({
        email: "student@example.com",
        role: "student",
        fullName: "Ada Student",
      });
      const [profile] = await db.seed<{ role: string; full_name: string }>(
        "select role, full_name from public.profiles where id = $1",
        [id],
      );
      expect(profile).toMatchObject({ role: "student", full_name: "Ada Student" });
    });
  });

  it("honours a self-service parent role", async () => {
    await withRollback(async (db) => {
      const id = await db.createUser({ email: "parent@example.com", role: "parent" });
      const [profile] = await db.seed<{ role: string }>(
        "select role from public.profiles where id = $1",
        [id],
      );
      expect(profile.role).toBe("parent");
    });
  });

  it("refuses an admin role supplied in signup metadata", async () => {
    // Signup metadata is client-controlled, so a caller could ask for admin
    // directly against the Auth API. The trigger must downgrade it.
    await withRollback(async (db) => {
      const id = await db.createUser({ email: "escalate@example.com", role: "admin" });
      const [profile] = await db.seed<{ role: string }>(
        "select role from public.profiles where id = $1",
        [id],
      );
      expect(profile.role).toBe("student");
    });
  });

  it("defaults to student for missing or unknown roles", async () => {
    await withRollback(async (db) => {
      const noRole = await db.createUser({ email: "none@example.com" });
      const bogus = await db.createUser({ email: "bogus@example.com", role: "wizard" });
      const rows = await db.seed<{ role: string }>(
        "select role from public.profiles where id = any($1)",
        [[noRole, bogus]],
      );
      expect(rows.map((r) => r.role)).toEqual(["student", "student"]);
    });
  });
});

describe("profile visibility", () => {
  it("lets a user read only their own profile", async () => {
    await withRollback(async (db) => {
      const self = await db.createUser({ email: "self@example.com", role: "student" });
      await db.createUser({ email: "other@example.com", role: "student" });

      const rows = await db.asUser(self, (q) =>
        q.run<{ id: string }>("select id from public.profiles"),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(self);
    });
  });

  it("lets a parent read a linked student's profile but not an unlinked one", async () => {
    await withRollback(async (db) => {
      const parent = await db.createUser({ email: "p@example.com", role: "parent" });
      const child = await db.createUser({ email: "c@example.com", role: "student" });
      const stranger = await db.createUser({ email: "s@example.com", role: "student" });
      await db.seed(
        "insert into public.parent_student_links (parent_id, student_id) values ($1, $2)",
        [parent, child],
      );

      const ids = await db.asUser(parent, (q) =>
        q.run<{ id: string }>("select id from public.profiles order by id"),
      );
      const visible = ids.map((r) => r.id);
      expect(visible).toContain(parent);
      expect(visible).toContain(child);
      expect(visible).not.toContain(stranger);
    });
  });

  it("lets an admin read every profile", async () => {
    await withRollback(async (db) => {
      const admin = await db.createUser({ email: "admin@example.com" });
      await db.setRole(admin, "admin");
      await db.createUser({ email: "a@example.com", role: "student" });
      await db.createUser({ email: "b@example.com", role: "parent" });

      const rows = await db.asUser(admin, (q) =>
        q.run("select id from public.profiles"),
      );
      expect(rows).toHaveLength(3);
    });
  });

  it("stops a user from promoting themselves to admin", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "climb@example.com", role: "student" });

      const result = await db.asUser(student, (q) =>
        q.attempt(
          "update public.profiles set role = 'admin' where id = $1 returning id",
          [student],
        ),
      );
      // Either the WITH CHECK rejects it, or it matches zero rows.
      expect(result.ok && result.rows.length > 0).toBe(false);

      const [profile] = await db.seed<{ role: string }>(
        "select role from public.profiles where id = $1",
        [student],
      );
      expect(profile.role).toBe("student");
    });
  });

  it("lets a user update their own name", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "rename@example.com", role: "student" });
      await db.asUser(student, (q) =>
        q.run("update public.profiles set full_name = 'New Name' where id = $1", [
          student,
        ]),
      );
      const [profile] = await db.seed<{ full_name: string }>(
        "select full_name from public.profiles where id = $1",
        [student],
      );
      expect(profile.full_name).toBe("New Name");
    });
  });
});

describe("admin-only RPCs", () => {
  it("returns the user directory to an admin", async () => {
    await withRollback(async (db) => {
      const admin = await db.createUser({ email: "admin@example.com" });
      await db.setRole(admin, "admin");
      await db.createUser({ email: "pupil@example.com", role: "student" });

      const rows = await db.asUser(admin, (q) =>
        q.run<{ email: string }>("select * from public.admin_list_users()"),
      );
      expect(rows.map((r) => r.email).sort()).toEqual([
        "admin@example.com",
        "pupil@example.com",
      ]);
    });
  });

  it("refuses the user directory to a student", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "nosy@example.com", role: "student" });
      const result = await db.asUser(student, (q) =>
        q.attempt("select * from public.admin_list_users()"),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });
  });

  it("refuses the user directory to an anonymous caller", async () => {
    // current_user_role() is NULL here; a plain `<> 'admin'` test would let
    // this through, so the guard has to be NULL-safe.
    await withRollback(async (db) => {
      await db.createUser({ email: "victim@example.com", role: "student" });
      const result = await db.asAnon((q) =>
        q.attempt("select * from public.admin_list_users()"),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });
  });

  it("refuses email lookup to non-admins, including anonymous callers", async () => {
    await withRollback(async (db) => {
      const student = await db.createUser({ email: "target@example.com", role: "student" });
      expect(student).toBeTruthy();

      const asStudent = await db.asUser(student, (q) =>
        q.attempt("select * from public.find_students_by_email($1)", [
          ["target@example.com"],
        ]),
      );
      expect(asStudent.ok).toBe(false);

      const asAnon = await db.asAnon((q) =>
        q.attempt("select * from public.find_students_by_email($1)", [
          ["target@example.com"],
        ]),
      );
      expect(asAnon.ok).toBe(false);
    });
  });

  it("resolves student emails for an admin", async () => {
    await withRollback(async (db) => {
      const admin = await db.createUser({ email: "admin@example.com" });
      await db.setRole(admin, "admin");
      const student = await db.createUser({ email: "found@example.com", role: "student" });
      await db.createUser({ email: "aparent@example.com", role: "parent" });

      const rows = await db.asUser(admin, (q) =>
        q.run<{ id: string; email: string }>(
          "select * from public.find_students_by_email($1)",
          [["found@example.com", "aparent@example.com", "missing@example.com"]],
        ),
      );
      // Parents and unknown addresses are not enrollable students.
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: student, email: "found@example.com" });
    });
  });
});
