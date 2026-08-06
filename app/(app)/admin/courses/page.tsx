import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";
import { Badge, ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Manage courses" };

const statusTone = {
  draft: "amber",
  published: "green",
  archived: "slate",
} as const;

export default async function AdminCoursesPage() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Courses</h1>
          <p className="mt-1 text-sm text-slate-500">
            Draft, publish, and organize course content.
          </p>
        </div>
        <ButtonLink href="/admin/courses/new">New course</ButtonLink>
      </div>

      <Card className="divide-y divide-slate-100 p-0">
        {(courses ?? []).length === 0 && (
          <p className="p-6 text-sm text-slate-500">
            No courses yet — create your first one.
          </p>
        )}
        {((courses ?? []) as Course[]).map((course) => (
          <Link
            key={course.id}
            href={`/admin/courses/${course.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{course.title}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {course.category ?? "Uncategorized"} · updated{" "}
                {new Date(course.updated_at).toLocaleDateString()}
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
