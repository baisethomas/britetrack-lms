import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { setUserRole, unlinkParentStudent } from "@/lib/actions/admin";
import type { UserRole } from "@/lib/types";
import { Badge, Card } from "@/components/ui";
import { LinkParentForm } from "./link-parent-form";

export const metadata: Metadata = { title: "Users" };

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

const roleTone = { admin: "brand", student: "green", parent: "amber" } as const;

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const [{ data, error }, { data: links }] = await Promise.all([
    supabase.rpc("admin_list_users"),
    supabase.from("parent_student_links").select("parent_id, student_id"),
  ]);
  const users = (data ?? []) as AdminUser[];

  const label = (u: AdminUser) => `${u.full_name || u.email} (${u.email})`;
  const byId = new Map(users.map((u) => [u.id, u]));
  const parents = users.filter((u) => u.role === "parent").map((u) => ({ id: u.id, label: label(u) }));
  const students = users.filter((u) => u.role === "student").map((u) => ({ id: u.id, label: label(u) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everyone with a BriteTrack account. Change roles with care.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-600">
          Could not load users: {error.message}
        </p>
      )}

      <LinkParentForm parents={parents} students={students} />

      {(links ?? []).length > 0 && (
        <Card>
          <h2 className="font-semibold">Parent–student links</h2>
          <ul className="mt-3 space-y-2">
            {(links ?? []).map((l) => {
              const parent = byId.get(l.parent_id);
              const student = byId.get(l.student_id);
              return (
                <li
                  key={`${l.parent_id}-${l.student_id}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span>
                    <span className="font-medium">
                      {parent?.full_name || parent?.email || "Unknown parent"}
                    </span>{" "}
                    <span className="text-slate-500">is linked to</span>{" "}
                    <span className="font-medium">
                      {student?.full_name || student?.email || "Unknown student"}
                    </span>
                  </span>
                  <form
                    action={unlinkParentStudent.bind(null, l.parent_id, l.student_id)}
                  >
                    <button
                      type="submit"
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Unlink
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Joined</th>
              <th className="px-5 py-3 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-5 py-3 font-medium">{user.full_name || "—"}</td>
                <td className="px-5 py-3 text-slate-600">{user.email}</td>
                <td className="px-5 py-3">
                  <Badge tone={roleTone[user.role]} className="capitalize">
                    {user.role}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-slate-500">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-5 py-3">
                  <form
                    action={async (formData: FormData) => {
                      "use server";
                      await setUserRole(
                        user.id,
                        formData.get("role") as UserRole,
                      );
                    }}
                    className="flex items-center gap-2"
                  >
                    <select
                      name="role"
                      defaultValue={user.role}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    >
                      <option value="student">student</option>
                      <option value="parent">parent</option>
                      <option value="admin">admin</option>
                    </select>
                    <button
                      type="submit"
                      className="text-xs font-medium text-brand-600 hover:underline"
                    >
                      Update
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {users.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
