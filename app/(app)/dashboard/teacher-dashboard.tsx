import Link from "next/link";
import { BookOpen, Hammer, Video } from "lucide-react";
import { getMySections, getRoster, getUpcomingSessions, type AppContext } from "@/lib/data";
import type { School } from "@/lib/types";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { SessionList } from "@/components/session-list";

export async function TeacherDashboard({ ctx }: { ctx: AppContext & { school: School } }) {
  const sections = (await getMySections(ctx)).filter((s) => s.my_role !== "student");
  const [rosters, sessions] = await Promise.all([
    Promise.all(sections.map((s) => getRoster(s.id))),
    getUpcomingSessions(sections.map((s) => s.id)),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">Good to see you, {ctx.profile.full_name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-muted">Your classes at {ctx.school.name}.</p>
        </div>
        <ButtonLink href="/admin/courses" variant="secondary">
          Set up a class
        </ButtonLink>
      </div>

      {sections.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-10" aria-hidden />}
          title="No classes yet"
          description="Create a course and open a section for it, or ask your administrator to assign you one."
          action={<ButtonLink href="/admin/courses/new">Create a course</ButtonLink>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {sections.map((section, i) => {
            const students = rosters[i].filter((r) => r.role === "student");
            return (
              <Card key={section.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/classes/${section.id}`}
                      className="text-heading font-semibold text-ink hover:text-ink-accent hover:underline"
                    >
                      {section.course.title}
                    </Link>
                    <div className="mt-0.5 text-sm text-muted">
                      {section.name} · {section.term.name}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm text-muted tabular-nums">
                    {students.length} student{students.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-4 flex gap-2">
                  <ButtonLink href={`/classes/${section.id}`} variant="secondary">
                    Open
                  </ButtonLink>
                  <ButtonLink href={`/classes/${section.id}/build`} variant="ghost">
                    <Hammer className="size-4" aria-hidden /> Build
                  </ButtonLink>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-heading font-semibold">
          <Video className="size-5 text-accent" aria-hidden /> Upcoming live classes
        </h2>
        <SessionList sessions={sessions} empty="Nothing scheduled. Add a session from a class's Build page." />
      </section>
    </div>
  );
}
