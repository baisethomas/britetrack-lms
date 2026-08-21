import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Clock, Lock } from "lucide-react";
import { getLessonsWithState, getProfile } from "@/lib/data";
import { completeLesson, startLesson } from "@/lib/actions/learning";
import { createClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";
import { formatDuration } from "@/lib/progress";
import {
  countAttempts,
  getAttemptReview,
  getLatestAttempt,
  getQuiz,
} from "@/lib/quiz";
import { Badge, Button, ButtonLink, Card } from "@/components/ui";
import { CurriculumRail } from "./curriculum-rail";
import { QuizPlayer } from "./quiz-player";
import { QuizResults } from "./quiz-results";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
  searchParams: Promise<{ retake?: string }>;
}) {
  const { courseId, lessonId } = await params;
  const { retake } = await searchParams;
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
        <Lock className="mx-auto size-10 text-subtle" aria-hidden />
        <h1 className="mt-4 text-heading font-semibold text-ink">This lesson is locked</h1>
        <p className="mt-1 text-sm text-muted">
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

  const isQuiz = lesson.content_type === "quiz";
  const questions = isQuiz ? await getQuiz(lesson.id) : [];
  const latestAttempt =
    isQuiz && questions.length > 0
      ? await getLatestAttempt(lesson.id, profile.id)
      : null;
  // A retake link re-opens the player over an existing result.
  const showResults = Boolean(latestAttempt) && retake !== "1";
  const [review, attemptCount] = latestAttempt
    ? await Promise.all([
        getAttemptReview(latestAttempt.id),
        countAttempts(lesson.id, profile.id),
      ])
    : [[], 0];

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <CurriculumRail
        courseId={courseId}
        courseTitle={course.title}
        currentLessonId={lesson.id}
        lessons={lessons.map((l) => ({
          id: l.id,
          title: l.title,
          position: l.position,
          duration_minutes: l.duration_minutes,
          completed: l.completed,
          locked: l.locked,
        }))}
      />
      <div className="min-w-0 space-y-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted">
          <Link href="/courses" className="hover:text-ink">
            Courses
          </Link>
          <ChevronRight className="size-3.5 text-subtle" aria-hidden />
          <Link href={`/courses/${courseId}`} className="truncate hover:text-ink">
            {course.title}
          </Link>
          <ChevronRight className="size-3.5 text-subtle" aria-hidden />
          <span className="truncate text-ink">{lesson.title}</span>
        </nav>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-title font-bold text-ink">{lesson.title}</h1>
            {lesson.completed && (
              <Badge tone="success" className="shrink-0">
                <CheckCircle2 className="mr-1 size-3.5" aria-hidden /> Completed
              </Badge>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-subtle">
            <span className="capitalize">
              {lesson.content_type.replace("_", " ")}
            </span>
            {lesson.duration_minutes > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                {formatDuration(lesson.duration_minutes)}
              </span>
            )}
          </div>
          {lesson.summary && (
            <p className="mt-3 text-sm text-muted">{lesson.summary}</p>
          )}

          {lesson.content_type === "video" && full?.video_url && (
            <div className="mt-4 aspect-video overflow-hidden rounded-card bg-sunken">
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
            <div className="mt-5 text-sm leading-relaxed whitespace-pre-wrap text-ink">
              {full.content}
            </div>
          )}
        </Card>

        {isQuiz &&
          (questions.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">
                This quiz has no questions yet. Check back once an administrator
                has added them.
              </p>
            </Card>
          ) : showResults && latestAttempt ? (
            <QuizResults
              attempt={latestAttempt}
              review={review}
              passMark={lesson.pass_mark}
              retakeHref={`/courses/${courseId}/lessons/${lesson.id}?retake=1`}
              attemptCount={attemptCount}
              lessonCompleted={lesson.completed}
            />
          ) : (
            <QuizPlayer
              lessonId={lesson.id}
              courseId={courseId}
              passMark={lesson.pass_mark}
              questions={questions}
            />
          ))}

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

          {isQuiz ? (
            next && !next.locked ? (
              <ButtonLink href={`/courses/${courseId}/lessons/${next.id}`}>
                Next lesson <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            ) : !next ? (
              // Last lesson in the course: the same way out that a finished
              // non-quiz lesson offers, rather than a dead end.
              <ButtonLink href={`/courses/${courseId}`} variant="secondary">
                Back to course
              </ButtonLink>
            ) : (
              <span />
            )
          ) : profile.role === "student" && !lesson.completed ? (
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

    </div>
  );
}
