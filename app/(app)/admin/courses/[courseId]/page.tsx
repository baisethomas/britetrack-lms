import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { deleteLesson, setCourseStatus } from "@/lib/actions/admin";
import type { Course, Lesson } from "@/lib/types";
import { Badge, Button, Card } from "@/components/ui";
import { AddLessonForm } from "./add-lesson-form";

export default async function AdminCourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const supabase = await createClient();
  const [{ data: course }, { data: lessons }, { count: enrollmentCount }] =
    await Promise.all([
      supabase.from("courses").select("*").eq("id", courseId).maybeSingle(),
      supabase.from("lessons").select("*").eq("course_id", courseId).order("position"),
      supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("course_id", courseId),
    ]);
  if (!course) notFound();
  const typedCourse = course as Course;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-display font-bold">{typedCourse.title}</h1>
              <Badge
                tone={
                  typedCourse.status === "published"
                    ? "success"
                    : typedCourse.status === "draft"
                      ? "warning"
                      : "neutral"
                }
                className="capitalize"
              >
                {typedCourse.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              {(lessons ?? []).length} lessons · {enrollmentCount ?? 0} enrolled ·{" "}
              {typedCourse.sequential_unlock ? "sequential unlock" : "free order"}
            </p>
          </div>
          <div className="flex gap-2">
            {typedCourse.status !== "published" && (
              <form action={setCourseStatus.bind(null, courseId, "published")}>
                <Button type="submit">Publish</Button>
              </form>
            )}
            {typedCourse.status === "published" && (
              <form action={setCourseStatus.bind(null, courseId, "draft")}>
                <Button type="submit" variant="secondary">
                  Unpublish
                </Button>
              </form>
            )}
            {typedCourse.status !== "archived" && (
              <form action={setCourseStatus.bind(null, courseId, "archived")}>
                <Button type="submit" variant="ghost">
                  Archive
                </Button>
              </form>
            )}
          </div>
        </div>
        {typedCourse.description && (
          <p className="mt-3 max-w-2xl text-sm text-muted">
            {typedCourse.description}
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-heading font-semibold">Lessons</h2>
          <Card className="divide-y divide-line p-0">
            {(lessons ?? []).length === 0 && (
              <p className="p-6 text-sm text-muted">
                No lessons yet — add the first one.
              </p>
            )}
            {((lessons ?? []) as Lesson[]).map((lesson) => (
              <div
                key={lesson.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/lessons/${lesson.id}`}
                    className="truncate text-sm font-medium hover:text-ink-accent hover:underline"
                  >
                    {lesson.position}. {lesson.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted capitalize">
                    {lesson.content_type.replace("_", " ")}
                    {lesson.duration_minutes ? ` · ${lesson.duration_minutes} min` : ""}
                  </div>
                </div>
                <form action={deleteLesson.bind(null, lesson.id, courseId)}>
                  <button
                    type="submit"
                    title="Delete lesson"
                    className="rounded-control p-2 text-subtle hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="size-4" aria-hidden />
                    <span className="sr-only">Delete {lesson.title}</span>
                  </button>
                </form>
              </div>
            ))}
          </Card>
        </div>

        <div>
          <h2 className="mb-3 text-heading font-semibold">Add lesson</h2>
          <AddLessonForm courseId={courseId} />
        </div>
      </div>
    </div>
  );
}
