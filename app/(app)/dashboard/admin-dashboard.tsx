import { BookOpen, CheckCircle2, GraduationCap, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink, Card } from "@/components/ui";

export async function AdminDashboard() {
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const [
    { count: students },
    { count: courses },
    { count: enrollments },
    { count: completions },
  ] = await Promise.all([
    supabase.from("profiles").select("id", head).eq("role", "student"),
    supabase.from("courses").select("id", head).eq("status", "published"),
    supabase.from("enrollments").select("id", head),
    supabase.from("enrollments").select("id", head).not("completed_at", "is", null),
  ]);

  const totalEnrollments = enrollments ?? 0;
  const totalCompletions = completions ?? 0;
  const stats = [
    { label: "Active students", value: students ?? 0, icon: Users },
    { label: "Published courses", value: courses ?? 0, icon: BookOpen },
    { label: "Enrollments", value: totalEnrollments, icon: GraduationCap },
    { label: "Course completions", value: totalCompletions, icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">Admin overview</h1>
          <p className="mt-1 text-sm text-muted">
            Activity across BriteTrack at a glance.
          </p>
        </div>
        <div className="flex gap-3">
          <ButtonLink href="/admin/courses" variant="secondary">
            Manage courses
          </ButtonLink>
          <ButtonLink href="/admin/enrollments">Bulk enroll</ButtonLink>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <s.icon className="size-5 text-accent" aria-hidden />
            <div className="mt-3 text-3xl font-bold tabular-nums">{s.value}</div>
            <div className="mt-1 text-sm text-muted">{s.label}</div>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="font-semibold">Completion rate</h2>
        <p className="mt-1 text-sm text-muted">
          {totalEnrollments
            ? `${Math.round((totalCompletions / totalEnrollments) * 100)}% of enrollments have finished their course.`
            : "No enrollments yet — publish a course and enroll students to see completion data."}
        </p>
      </Card>
    </div>
  );
}
