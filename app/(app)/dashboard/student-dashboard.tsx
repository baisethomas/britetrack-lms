import Link from "next/link";
import { BookOpen, Flame, PlayCircle, Video } from "lucide-react";
import { getCoursesWithProgress, getLessonsWithState, getStreak } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { LiveSession, Profile } from "@/lib/types";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  ProgressBar,
  ProgressRing,
} from "@/components/ui";

export async function StudentDashboard({ profile }: { profile: Profile }) {
  const [courses, streak] = await Promise.all([
    getCoursesWithProgress(profile.id),
    getStreak(profile.id),
  ]);

  const enrolled = courses.filter((c) => c.enrollment);
  const active = enrolled.filter((c) => !c.enrollment?.completed_at);
  const totalLessons = enrolled.reduce((n, c) => n + c.totalLessons, 0);
  const completedLessons = enrolled.reduce((n, c) => n + c.completedLessons, 0);
  const overall = totalLessons ? (completedLessons / totalLessons) * 100 : 0;

  // "Continue learning": first incomplete lesson of the most recently enrolled active course.
  const current = active.sort(
    (a, b) =>
      new Date(b.enrollment!.enrolled_at).getTime() -
      new Date(a.enrollment!.enrolled_at).getTime(),
  )[0];
  const nextLesson = current
    ? (await getLessonsWithState(current.course, profile.id)).find(
        (l) => !l.completed && !l.locked,
      )
    : undefined;

  // Upcoming live sessions for enrolled courses.
  const supabase = await createClient();
  const { data: sessions } = await supabase
    .from("live_sessions")
    .select("*")
    .in(
      "course_id",
      enrolled.map((c) => c.course.id),
    )
    .gte("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(3);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Hi, {profile.full_name.split(" ")[0] || "there"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {nextLesson
              ? "Ready for your next lesson?"
              : "Explore the catalog to start a new course."}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-amber-700">
          <Flame className="size-4" aria-hidden />
          <span className="text-sm font-semibold">
            {streak}-day streak
          </span>
        </div>
      </div>

      {/* Continue learning */}
      {current && nextLesson ? (
        <Card className="flex flex-wrap items-center gap-6 border-brand-100 bg-gradient-to-r from-brand-50 to-white">
          <ProgressRing
            value={
              current.totalLessons
                ? (current.completedLessons / current.totalLessons) * 100
                : 0
            }
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium tracking-wide text-brand-700 uppercase">
              Continue learning
            </div>
            <h2 className="mt-1 truncate text-lg font-semibold">
              {current.course.title}
            </h2>
            <p className="mt-0.5 truncate text-sm text-slate-500">
              Next up: {nextLesson.title}
            </p>
          </div>
          <ButtonLink
            href={`/courses/${current.course.id}/lessons/${nextLesson.id}`}
          >
            <PlayCircle className="size-4" aria-hidden />
            Resume
          </ButtonLink>
        </Card>
      ) : (
        <EmptyState
          icon={<BookOpen className="size-10" aria-hidden />}
          title={enrolled.length ? "All caught up!" : "Start your first course"}
          description={
            enrolled.length
              ? "You've finished everything you're enrolled in. Browse the catalog for what's next."
              : "Enroll in a course from the catalog — the first lesson is open right away."
          }
          action={<ButtonLink href="/courses">Browse courses</ButtonLink>}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* My courses */}
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-lg font-semibold">My courses</h2>
          {enrolled.length === 0 ? (
            <p className="text-sm text-slate-500">
              Courses you enroll in will appear here.
            </p>
          ) : (
            enrolled.map(({ course, enrollment, totalLessons, completedLessons }) => (
              <Card key={course.id} className="p-4">
                <Link
                  href={`/courses/${course.id}`}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{course.title}</span>
                      {enrollment?.completed_at && (
                        <Badge tone="green">Completed</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {completedLessons} of {totalLessons} lessons
                    </p>
                  </div>
                  <div className="w-28 shrink-0">
                    <ProgressBar
                      value={totalLessons ? (completedLessons / totalLessons) * 100 : 0}
                    />
                  </div>
                </Link>
              </Card>
            ))
          )}
        </div>

        {/* Side column */}
        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-semibold text-slate-500">Overall progress</h2>
            <div className="mt-3 flex items-center gap-4">
              <ProgressRing value={overall} />
              <p className="text-sm text-slate-600">
                {completedLessons} lessons completed across {enrolled.length}{" "}
                {enrolled.length === 1 ? "course" : "courses"}
              </p>
            </div>
          </Card>
          <Card>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              <Video className="size-4" aria-hidden /> Upcoming live sessions
            </h2>
            {(sessions ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No live sessions scheduled.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {(sessions as LiveSession[]).map((s) => (
                  <li key={s.id} className="text-sm">
                    <div className="font-medium">{s.title}</div>
                    <div className="text-slate-500">
                      {new Date(s.starts_at).toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                    {s.join_url && (
                      <a
                        href={s.join_url}
                        className="text-brand-600 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Join on Zoom
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
