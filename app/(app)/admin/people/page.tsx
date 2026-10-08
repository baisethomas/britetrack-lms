import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSchool } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { revokeInvitation, setGradeLevel } from "@/lib/actions/school";
import { GRADE_LEVELS, gradeLabel, type Invitation, type SchoolRole } from "@/lib/types";
import { Badge, Card } from "@/components/ui";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "People" };

interface Person {
  id: string;
  email: string;
  full_name: string;
  roles: SchoolRole[];
  grade_level: number | null;
  created_at: string;
}

const ROLE_LABEL: Record<SchoolRole, string> = {
  school_admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  guardian: "Guardian",
  staff: "Staff",
};

const roleTone: Record<SchoolRole, "accent" | "success" | "warning" | "neutral"> = {
  school_admin: "accent",
  teacher: "success",
  student: "neutral",
  guardian: "warning",
  staff: "neutral",
};

export default async function PeoplePage() {
  const ctx = await requireSchool();
  if (!ctx.isAdmin) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data, error }, { data: invites }] = await Promise.all([
    supabase.rpc("school_people", { p_school: ctx.school.id }),
    supabase
      .from("invitations")
      .select("*")
      .eq("school_id", ctx.school.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);
  const people = (data ?? []) as Person[];
  const pending = (invites ?? []) as Invitation[];
  const students = people
    .filter((p) => p.roles.includes("student"))
    .map((p) => ({ id: p.id, label: `${p.full_name || p.email} (${p.email})` }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display font-bold">People</h1>
        <p className="mt-1 text-sm text-muted">
          Everyone at {ctx.school.name}. Invite by email; each link works only for the address it
          was sent to.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          Could not load people: {error.message}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted uppercase">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Roles</th>
                  <th className="px-5 py-3 font-medium">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {people.map((person) => (
                  <tr key={person.id}>
                    <td className="px-5 py-3 font-medium">{person.full_name || "—"}</td>
                    <td className="px-5 py-3 text-muted">{person.email}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {person.roles.map((r) => (
                          <Badge key={r} tone={roleTone[r]}>
                            {ROLE_LABEL[r]}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {person.roles.includes("student") ? (
                        <form action={setGradeLevel.bind(null, person.id)} className="flex items-center gap-2">
                          <select
                            name="grade_level"
                            defaultValue={person.grade_level ?? 0}
                            className="rounded-control border border-line bg-raised px-2 py-1 text-xs"
                          >
                            {GRADE_LEVELS.map((g) => (
                              <option key={g} value={g}>
                                {gradeLabel(g)}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="text-xs font-medium text-accent hover:underline">
                            Save
                          </button>
                        </form>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {people.length === 0 && !error && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-muted">
                      Just you so far.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          {pending.length > 0 && (
            <div>
              <h2 className="mb-3 text-heading font-semibold">Pending invitations</h2>
              <Card className="divide-y divide-line p-0">
                {pending.map((inv) => (
                  <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-ink">{inv.email}</div>
                      <div className="text-xs text-muted">
                        {ROLE_LABEL[inv.role]}
                        {inv.grade_level !== null && ` · ${gradeLabel(inv.grade_level)}`}
                        {" · expires "}
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </div>
                      <code className="mt-1 block truncate text-xs text-subtle">/join/{inv.token}</code>
                    </div>
                    <form action={revokeInvitation.bind(null, inv.id)}>
                      <button type="submit" className="text-xs text-danger hover:underline">
                        Revoke
                      </button>
                    </form>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </div>

        <aside>
          <InviteForm students={students} />
        </aside>
      </div>
    </div>
  );
}
