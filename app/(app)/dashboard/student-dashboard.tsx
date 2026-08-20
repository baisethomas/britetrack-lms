import Link from "next/link";
import { BookOpen, Clock, Flame, PlayCircle, Video } from "lucide-react";
import {
  getCoursesWithProgress,
  getLessonsWithState,
  getStreakSummary,
} from "@/lib/data";
import { completionPercent, formatDuration } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";
import type { LiveSession, Profile } from "@/lib/types";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Eyebrow,
  ProgressBar,
  ProgressRing,
  StreakDots,
} from "@/components/ui";

/** Decorative tile standing in for course art until covers are uploaded. */
function CourseTile({ title, className }: { title: string; className?: string }) {
  return (
    <div
      aria-hidden
      className={`flex items-center justify-center rounded-card bg-gradient-to-br from-accent to-brand-800 text-display font-bold text-white ${className ?? ""}`}
    >
      {title.slice(0, 1).toUpperCase()}
    </div>
  );
}

export async function StudentDashboard({ profile }: { profile: Profile }) {
  const [courses, { streak, days }] = await Promise.all([
    getCoursesWithProgress(profile.id),
    getStreakSummary(profile.id),
  ]);

  const enrolled = courses.filter((c) => c.enrollment);
  const active = enrolled.filter((c) => !c.enrollment?.completed_at);
  const totalLessons = enrolled.reduce((n, c) => n + c.totalLessons, 0);
  const completedLessons = enrolled.reduce((n, c) => n + c.completedLessons, 0);

  // "Continue learning": the most recently enrolled course still in progress.
  const current = active.sort(
    (a, b) =>
      new Date(b.enrollment!.enrolled_at).getTime() -
      new Date(a.enrollment!.enrolled_at).getTime(),
  )[0];

  const currentLessons = current
    ? await getLessonsWithState(current.course, profile.id)
    : [];
  const nextLesson = currentLessons.find((l) => !l.completed && !l.locked);
  // Reference cards pair "% complete" with time remaining, which is the more
  // actionable half — it answers "can I finish this now?".
  const minutesLeft = currentLessons
    .filter((l) => !l.completed)
    .reduce((n, l) => n + l.duration_minutes, 0);

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
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display font-bold text-ink">
            Hi, {profile.full_name.split(" ")[0] || "there"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {nextLesson
              ? "Pick up where you left off."
              : "Explore the catalog to start a new course."}
          </p>
        </div>
      </div>

      {current && nextLesson ? (
        <Card className="border-line bg-raised p-0">
          <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
            <CourseTile
              title={current.course.title}
              className="h-24 w-full shrink-0 sm:w-32"
            />
            <div className="min-w-0 flex-1">
              <Eyebrow>Continue learning</Eyebrow>
              <h2 className="mt-1.5 truncate text-title font-semibold text-ink">
                {current.course.title}
              </h2>
              <p className="mt-1 truncate text-sm text-muted">
                Next up · {nextLesson.title}
              </p>
              <div className="mt-4 flex items-center gap-3">
                <ProgressBar
                  value={completionPercent(
                    current.completedLessons,
                    current.totalLessons,
                  )}
                  className="max-w-xs flex-1"
                />
                <span className="text-xs font-medium text-muted tabular-nums">
                  {Math.round(
                    completionPercent(
                      current.completedLessons,
                      current.totalLessons,
                    ),
                  )}
                  %
                </span>
                {minutesLeft > 0 && (
                  <span className="flex items-center gap-1 text-xs text-subtle">
                    <Clock className="size-3.5" aria-hidden />
                    {formatDuration(minutesLeft)} left
                  </span>
                )}
              </div>
            </div>
            <ButtonLink
              href={`/courses/${current.course.id}/lessons/${nextLesson.id}`}
              className="shrink-0"
            >
              <PlayCircle className="size-4" aria-hidden />
              Resume
            </ButtonLink>
          </div>
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
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-heading font-semibold text-ink">My courses</h2>
          {enrolled.length === 0 ? (
            <p className="text-sm text-muted">
              Courses you enroll in will appear here.
            </p>
          ) : (
            <div className="space-y-3">
              {enrolled.map(
                ({ course, enrollment, totalLessons: total, completedLessons: done }) => (
                  <Link
                    key={course.id}
                    href={`/courses/${course.id}`}
                    className="block rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <Card className="p-4 transition-shadow hover:shadow-raised">
                      <div className="flex items-center gap-4">
                        <CourseTile title={course.title} className="size-12 shrink-0 text-base" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-ink">
                              {course.title}
                            </span>
                            {enrollment?.completed_at && (
                              <Badge tone="success">Completed</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm text-muted">
                            {done} of {total} lessons
                          </p>
                          <ProgressBar
                            value={completionPercent(done, total)}
                            tone={enrollment?.completed_at ? "success" : "accent"}
                            className="mt-2"
                          />
                        </div>
                      </div>
                    </Card>
                  </Link>
                ),
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Flame className="size-4 text-streak" aria-hidden />
                {streak > 0 ? `${streak}-day streak` : "Start a streak"}
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted">
              {streak > 0
                ? "Complete a lesson today to keep it going."
                : "Complete a lesson to begin one."}
            </p>
            <div className="mt-4">
              <StreakDots days={days} />
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-ink">Overall progress</h2>
            <div className="mt-3 flex items-center gap-4">
              <ProgressRing value={completionPercent(completedLessons, totalLessons)} />
              <p className="text-sm text-muted">
                {completedLessons} lessons completed across {enrolled.length}{" "}
                {enrolled.length === 1 ? "course" : "courses"}
              </p>
            </div>
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Video className="size-4" aria-hidden /> Upcoming live sessions
            </h2>
            {(sessions ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted">No live sessions scheduled.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {(sessions as LiveSession[]).map((s) => (
                  <li key={s.id} className="text-sm">
                    <div className="font-medium text-ink">{s.title}</div>
                    <div className="text-muted">
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
                        className="text-ink-accent hover:underline"
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
