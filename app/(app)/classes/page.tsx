import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getMySections, getSchoolSections, requireSchool } from "@/lib/data";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "My classes" };

const ROLE_LABEL = {
  teacher: "Teacher",
  co_teacher: "Co-teacher",
  aide: "Aide",
  student: "Student",
} as const;

export default async function ClassesPage() {
  const ctx = await requireSchool();
  const sections = ctx.isAdmin
    ? await getSchoolSections(ctx.school.id)
    : await getMySections(ctx);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">{ctx.isAdmin ? "All classes" : "My classes"}</h1>
          <p className="mt-1 text-sm text-muted">
            {ctx.isAdmin
              ? `Every section at ${ctx.school.name}.`
              : "The classes you're part of this term."}
          </p>
        </div>
        {(ctx.isAdmin || ctx.isTeacher) && (
          <ButtonLink href="/admin/courses">Open a class</ButtonLink>
        )}
      </div>

      {sections.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-10" aria-hidden />}
          title="No classes yet"
          description={
            ctx.isStudent
              ? "Your school will add you to your classes."
              : "Create a course, then open a section for it."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <Link key={section.id} href={`/classes/${section.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold text-ink">{section.course.title}</h2>
                  {section.my_role && (
                    <Badge tone={section.my_role === "student" ? "accent" : "success"}>
                      {ROLE_LABEL[section.my_role]}
                    </Badge>
                  )}
                  {section.status === "archived" && <Badge tone="neutral">Archived</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {section.name} · {section.term.name}
                </p>
                {section.course.subject && (
                  <Badge tone="neutral" className="mt-3">
                    {section.course.subject}
                  </Badge>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
