import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Lock,
  PlayCircle,
  Signal,
} from "lucide-react";
import { getLessonsWithState, getProfile } from "@/lib/data";
import { enrollInCourse } from "@/lib/actions/learning";
import { createClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";
import { completionPercent, formatDuration } from "@/lib/progress";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Eyebrow,
  ProgressBar,
} from "@/components/ui";

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
  const pct = completionPercent(completed, lessons.length);
  const nextLesson = lessons.find((l) => !l.completed && !l.locked);
  const totalMinutes = lessons.reduce((n, l) => n + l.duration_minutes, 0);
  const canEnroll = profile.role === "student" && !enrollment;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-6">
        <div>
          {course.category && <Eyebrow>{course.category}</Eyebrow>}
          <h1 className="mt-1.5 text-display font-bold text-ink">{course.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            {course.description}
          </p>
        </div>

        {enrollment && lessons.length > 0 && (
          <Card>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-ink">Your progress</span>
              <span className="text-muted tabular-nums">
                {completed} of {lessons.length} lessons
              </span>
            </div>
            <ProgressBar
              value={pct}
              tone={enrollment.completed_at ? "success" : "accent"}
              className="mt-3"
            />
          </Card>
        )}

        <div>
          <h2 className="mb-3 text-heading font-semibold text-ink">Curriculum</h2>
          <Card className="divide-y divide-line p-0">
            {lessons.length === 0 && (
              <p className="p-6 text-sm text-muted">No lessons yet.</p>
            )}
            {lessons.map((lesson) => {
              const isNext = nextLesson?.id === lesson.id;
              const row = (
                <div className="flex items-center gap-4 px-5 py-3.5">
                  {lesson.completed ? (
                    <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
                  ) : lesson.locked ? (
                    <Lock className="size-5 shrink-0 text-subtle" aria-hidden />
                  ) : (
                    <Circle className="size-5 shrink-0 text-subtle" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div
                      className={`flex items-center gap-2 text-sm font-medium ${
                        lesson.locked ? "text-subtle" : "text-ink"
                      }`}
                    >
                      <span className="truncate">
                        {lesson.position}. {lesson.title}
                      </span>
                      {isNext && enrollment && (
                        <Badge tone="accent" className="shrink-0">
                          {completed > 0 ? "Up next" : "Start here"}
                        </Badge>
                      )}
                    </div>
                    {lesson.summary && (
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {lesson.summary}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-subtle">
                    <span className="capitalize">
                      {lesson.content_type.replace("_", " ")}
                    </span>
                    {lesson.duration_minutes > 0 && (
                      <span className="tabular-nums">
                        {formatDuration(lesson.duration_minutes)}
                      </span>
                    )}
                  </div>
                </div>
              );

              return enrollment && !lesson.locked ? (
                <Link
                  key={lesson.id}
                  href={`/courses/${course.id}/lessons/${lesson.id}`}
                  className="block hover:bg-hover"
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
            <p className="mt-2 text-xs text-subtle">
              Lessons unlock in order — finish one to open the next.
            </p>
          )}
        </div>
      </div>

      {/* Reference course pages keep the CTA and the at-a-glance facts in a
          rail beside the syllabus rather than above it. */}
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          {canEnroll ? (
            <form action={enrollInCourse.bind(null, course.id)}>
              <Button type="submit" className="w-full">
                Enroll in this course
              </Button>
            </form>
          ) : enrollment && nextLesson ? (
            <ButtonLink
              href={`/courses/${course.id}/lessons/${nextLesson.id}`}
              className="w-full"
            >
              <PlayCircle className="size-4" aria-hidden />
              {completed > 0 ? "Continue" : "Start course"}
            </ButtonLink>
          ) : enrollment ? (
            <Badge tone="success" className="w-full justify-center py-1.5">
              Course completed 🎉
            </Badge>
          ) : (
            <p className="text-sm text-muted">
              This course is managed by an administrator.
            </p>
          )}

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex items-center gap-2.5 text-muted">
              <BookOpen className="size-4 shrink-0" aria-hidden />
              <dt className="sr-only">Lessons</dt>
              <dd>
                {lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}
              </dd>
            </div>
            {totalMinutes > 0 && (
              <div className="flex items-center gap-2.5 text-muted">
                <Clock className="size-4 shrink-0" aria-hidden />
                <dt className="sr-only">Total length</dt>
                <dd>{formatDuration(totalMinutes)} of material</dd>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-muted">
              <Signal className="size-4 shrink-0" aria-hidden />
              <dt className="sr-only">Structure</dt>
              <dd>
                {course.sequential_unlock ? "Sequential unlock" : "Learn in any order"}
              </dd>
            </div>
          </dl>
        </Card>
      </aside>
    </div>
  );
}
