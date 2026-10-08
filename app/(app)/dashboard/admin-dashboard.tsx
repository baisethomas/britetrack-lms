import Link from "next/link";
import { BookOpen, CalendarDays, GraduationCap, Users, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSchoolSections, getUpcomingSessions, type AppContext } from "@/lib/data";
import type { School } from "@/lib/types";
import { ButtonLink, Card } from "@/components/ui";
import { SessionList } from "@/components/session-list";

export async function AdminDashboard({ ctx }: { ctx: AppContext & { school: School } }) {
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const [{ count: students }, { count: teachers }, { count: courses }, { count: terms }, sections] =
    await Promise.all([
      supabase.from("memberships").select("id", head).eq("school_id", ctx.school.id).eq("role", "student").eq("status", "active"),
      supabase.from("memberships").select("id", head).eq("school_id", ctx.school.id).eq("role", "teacher").eq("status", "active"),
      supabase.from("courses").select("id", head).eq("school_id", ctx.school.id).eq("status", "published"),
      supabase.from("terms").select("id", head).eq("school_id", ctx.school.id),
      getSchoolSections(ctx.school.id),
    ]);
  const active = sections.filter((s) => s.status === "active");
  const sessions = await getUpcomingSessions(active.map((s) => s.id));

  const stats = [
    { label: "Students", value: students ?? 0, icon: GraduationCap, href: "/admin/people" },
    { label: "Teachers", value: teachers ?? 0, icon: Users, href: "/admin/people" },
    { label: "Published courses", value: courses ?? 0, icon: BookOpen, href: "/admin/courses" },
    { label: "Active classes", value: active.length, icon: CalendarDays, href: "/classes" },
  ];

  // The first things a new school needs, in order, until each exists.
  const setup = [
    { done: (terms ?? 0) > 0, label: "Add a term so classes have dates", href: "/admin/school" },
    { done: (teachers ?? 0) > 0, label: "Invite your teachers", href: "/admin/people" },
    { done: (courses ?? 0) > 0, label: "Create a course", href: "/admin/courses/new" },
    { done: active.length > 0, label: "Open a class section and roster students", href: "/admin/courses" },
  ];
  const remaining = setup.filter((s) => !s.done);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">{ctx.school.name}</h1>
          <p className="mt-1 text-sm text-muted">Where things stand today.</p>
        </div>
        <div className="flex gap-3">
          <ButtonLink href="/admin/people" variant="secondary">
            Invite people
          </ButtonLink>
          <ButtonLink href="/admin/courses/new">New course</ButtonLink>
        </div>
      </div>

      {remaining.length > 0 && (
        <Card className="border-accent/40">
          <h2 className="font-semibold text-ink">Finish setting up</h2>
          <ol className="mt-3 space-y-2">
            {setup.map((step) => (
              <li key={step.label} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                    step.done ? "border-success bg-success text-white" : "border-line-strong"
                  }`}
                >
                  {step.done ? "✓" : ""}
                </span>
                {step.done ? (
                  <span className="text-muted line-through">{step.label}</span>
                ) : (
                  <Link href={step.href} className="text-ink hover:text-ink-accent hover:underline">
                    {step.label}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="h-full p-5 transition-shadow hover:shadow-md">
              <s.icon className="size-5 text-accent" aria-hidden />
              <div className="mt-3 text-3xl font-bold tabular-nums">{s.value}</div>
              <div className="mt-1 text-sm text-muted">{s.label}</div>
            </Card>
          </Link>
        ))}
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-heading font-semibold">
          <Video className="size-5 text-accent" aria-hidden /> Upcoming live classes
        </h2>
        <SessionList sessions={sessions} empty="No live classes scheduled across the school." />
      </section>
    </div>
  );
}
