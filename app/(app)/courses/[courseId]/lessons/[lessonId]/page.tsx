import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Lock } from "lucide-react";
import { getLessonsWithState, getProfile } from "@/lib/data";
import { completeLesson, startLesson } from "@/lib/actions/learning";
import { createClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";
import { Badge, Button, ButtonLink, Card } from "@/components/ui";
import { CurriculumRail } from "./curriculum-rail";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const profile = await getProfile();
  const supabase = await createClient();

  const [{ data: course }, { data: enrollment }] = await Promise.all([
    supabase.from("courses").select("*").eq("id", courseId).maybeSingle(),
    supabase
      .from("enrollments")
      .select("id")
      .eq("course_id", courseId)
      .eq("student_id", profile.id)
      .maybeSingle(),
  ]);
  if (!course) notFound();
  if (!enrollment && profile.role === "student") redirect(`/courses/${courseId}`);

  const lessons = await getLessonsWithState(course as Course, profile.id);
  const index = lessons.findIndex((l) => l.id === lessonId);
  if (index === -1) notFound();
  const lesson = lessons[index];

  if (lesson.locked) {
    return (
      <Card className="mx-auto max-w-lg py-12 text-center">
        <Lock className="mx-auto size-10 text-slate-300" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold">This lesson is locked</h1>
        <p className="mt-1 text-sm text-slate-500">
          Finish the previous lesson to unlock it.
        </p>
        <ButtonLink href={`/courses/${courseId}`} variant="secondary" className="mt-4">
          Back to course
        </ButtonLink>
      </Card>
    );
  }

  // Lesson body and video live behind RLS (can_access_lesson) — this read
  // only succeeds for enrolled-and-unlocked students, parents, or admins.
  const { data: full } = await supabase
    .from("lessons")
    .select("content, video_url")
    .eq("id", lesson.id)
    .maybeSingle();

  // Record that the student opened this lesson.
  if (profile.role === "student" && !lesson.completed) {
    await startLesson(lesson.id);
  }

  const prev = index > 0 ? lessons[index - 1] : null;
  const next = index < lessons.length - 1 ? lessons[index + 1] : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0 space-y-4">
        <Link
          href={`/courses/${courseId}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {course.title}
        </Link>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold">{lesson.title}</h1>
            {lesson.completed && (
              <Badge tone="green" className="shrink-0">
                <CheckCircle2 className="mr-1 size-3.5" aria-hidden /> Completed
              </Badge>
            )}
          </div>
          {lesson.summary && (
            <p className="mt-1 text-sm text-slate-500">{lesson.summary}</p>
          )}

          {lesson.content_type === "video" && full?.video_url && (
            <div className="mt-4 aspect-video overflow-hidden rounded-xl bg-slate-900">
              <iframe
                src={full.video_url}
                title={lesson.title}
                className="size-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {full?.content && (
            <div className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
              {full.content}
            </div>
          )}
        </Card>

        <div className="flex items-center justify-between gap-3">
          {prev ? (
            <ButtonLink
              href={`/courses/${courseId}/lessons/${prev.id}`}
              variant="secondary"
            >
              <ArrowLeft className="size-4" aria-hidden /> Previous
            </ButtonLink>
          ) : (
            <span />
          )}

          {profile.role === "student" && !lesson.completed ? (
            <form action={completeLesson.bind(null, lesson.id, courseId)}>
              <Button type="submit">
                <CheckCircle2 className="size-4" aria-hidden />
                Mark complete{next ? " & continue" : ""}
              </Button>
            </form>
          ) : next && !next.locked ? (
            <ButtonLink href={`/courses/${courseId}/lessons/${next.id}`}>
              Next lesson <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          ) : !next ? (
            <ButtonLink href={`/courses/${courseId}`} variant="secondary">
              Back to course
            </ButtonLink>
          ) : null}
        </div>
      </div>

      <CurriculumRail
        courseId={courseId}
        currentLessonId={lesson.id}
        lessons={lessons.map((l) => ({
          id: l.id,
          title: l.title,
          position: l.position,
          completed: l.completed,
          locked: l.locked,
        }))}
      />
    </div>
  );
}
