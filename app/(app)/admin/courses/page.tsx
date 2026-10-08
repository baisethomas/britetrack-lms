import type { Metadata } from "next";
import Link from "next/link";
import { requireSchool } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { gradeLabel, type Course } from "@/lib/types";
import { Badge, ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Courses" };

const statusTone = { draft: "warning", published: "success", archived: "neutral" } as const;

function gradeRange(levels: number[]): string {
  if (levels.length === 0) return "";
  const sorted = [...levels].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  return lo === hi ? gradeLabel(lo) : `${gradeLabel(lo)}–${gradeLabel(hi)}`;
}

export default async function CoursesPage() {
  const ctx = await requireSchool();
  const supabase = await createClient();
  const { data } = await supabase
    .from("courses")
    .select("*")
    .eq("school_id", ctx.school.id)
    .order("title");
  const courses = (data ?? []) as Course[];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">Courses</h1>
          <p className="mt-1 text-sm text-muted">
            The catalog. Open a course to add class sections for a term.
          </p>
        </div>
        <ButtonLink href="/admin/courses/new">New course</ButtonLink>
      </div>

      <Card className="divide-y divide-line p-0">
        {courses.length === 0 && (
          <p className="p-6 text-sm text-muted">No courses yet — create the first one.</p>
        )}
        {courses.map((course) => (
          <Link
            key={course.id}
            href={`/admin/courses/${course.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-hover"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{course.title}</div>
              <div className="mt-0.5 text-xs text-muted">
                {[course.subject, gradeRange(course.grade_levels), course.credits ? `${course.credits} credits` : null]
                  .filter(Boolean)
                  .join(" · ") || "No details yet"}
              </div>
            </div>
            <Badge tone={statusTone[course.status]} className="capitalize">
              {course.status}
            </Badge>
          </Link>
        ))}
      </Card>
    </div>
  );
}
