import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Clock,
  Lock,
  PlayCircle,
} from "lucide-react";
import { getLessonsWithState, getProfile } from "@/lib/data";
import { enrollInCourse } from "@/lib/actions/learning";
import { createClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";
import { Badge, Button, ButtonLink, Card, ProgressBar } from "@/components/ui";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const profile = await getProfile();
  const supabase = await createClient();

  const [{ data: course }, { data: enrollment }] = await Promise.all([
    supabase.from("courses").select("*").eq("id", courseId).maybeSingle(),
    supabase
      .from("enrollments")
      .select("*")
      .eq("course_id", courseId)
      .eq("student_id", profile.id)
      .maybeSingle(),
  ]);
  if (!course) notFound();

  const lessons = await getLessonsWithState(course as Course, profile.id);
  const completed = lessons.filter((l) => l.completed).length;
  const pct = lessons.length ? (completed / lessons.length) * 100 : 0;
  const nextLesson = lessons.find((l) => !l.completed && !l.locked);
  const totalMinutes = lessons.reduce((n, l) => n + l.duration_minutes, 0);
  const canEnroll = profile.role === "student" && !enrollment;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {course.category && <Badge tone="slate">{course.category}</Badge>}
            <h1 className="mt-2 text-2xl font-bold">{course.title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              {course.description}
            </p>
            <div className="mt-3 flex items-center gap-4 text-sm text-slate-500">
              <span>{lessons.length} lessons</span>
              {totalMinutes > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden />
                  {totalMinutes} min
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2">
            {canEnroll ? (
              <form action={enrollInCourse.bind(null, course.id)}>
                <Button type="submit" className="w-full">
                  Enroll in this course
                </Button>
              </form>
            ) : enrollment && nextLesson ? (
              <ButtonLink href={`/courses/${course.id}/lessons/${nextLesson.id}`}>
                <PlayCircle className="size-4" aria-hidden />
                {completed > 0 ? "Continue" : "Start course"}
              </ButtonLink>
            ) : enrollment ? (
              <Badge tone="green" className="justify-center py-1">
                Course completed 🎉
              </Badge>
            ) : null}
          </div>
        </div>
        {enrollment && lessons.length > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <ProgressBar value={pct} className="flex-1" />
            <span className="text-sm font-medium text-slate-600">
              {Math.round(pct)}%
            </span>
          </div>
        )}
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Curriculum</h2>
        <Card className="divide-y divide-slate-100 p-0">
          {lessons.length === 0 && (
            <p className="p-6 text-sm text-slate-500">No lessons yet.</p>
          )}
          {lessons.map((lesson) => {
            const row = (
              <div className="flex items-center gap-4 px-5 py-4">
                {lesson.completed ? (
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-500" aria-hidden />
                ) : lesson.locked ? (
                  <Lock className="size-5 shrink-0 text-slate-300" aria-hidden />
                ) : (
                  <Circle className="size-5 shrink-0 text-slate-300" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-sm font-medium ${
                      lesson.locked ? "text-slate-400" : ""
                    }`}
                  >
                    {lesson.position}. {lesson.title}
                  </div>
                  {lesson.summary && (
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {lesson.summary}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-slate-400">
                  <span className="capitalize">{lesson.content_type.replace("_", " ")}</span>
                  {lesson.duration_minutes > 0 && (
                    <span>{lesson.duration_minutes} min</span>
                  )}
                </div>
              </div>
            );

            const accessible = enrollment && !lesson.locked;
            return accessible ? (
              <Link
                key={lesson.id}
                href={`/courses/${course.id}/lessons/${lesson.id}`}
                className="block hover:bg-slate-50"
              >
                {row}
              </Link>
            ) : (
              <div key={lesson.id} aria-disabled className="cursor-not-allowed">
                {row}
              </div>
            );
          })}
        </Card>
        {course.sequential_unlock && (
          <p className="mt-2 text-xs text-slate-500">
            Lessons unlock in order — finish one to open the next.
          </p>
        )}
      </div>
    </div>
  );
}
