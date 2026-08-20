import Link from "next/link";
import { CheckCircle2, Circle, Lock, PlayCircle } from "lucide-react";
import { completionPercent, formatDuration } from "@/lib/progress";
import { ProgressBar } from "@/components/ui";

interface RailLesson {
  id: string;
  title: string;
  position: number;
  duration_minutes: number;
  completed: boolean;
  locked: boolean;
}

/**
 * Course contents alongside the lesson. Reference players (Coursera, Podia,
 * Squarespace) put this on the left with the course title and a completion
 * count at the top, and carry each lesson's duration on the row so learners
 * can judge what fits in the time they have.
 */
export function CurriculumRail({
  courseId,
  courseTitle,
  currentLessonId,
  lessons,
}: {
  courseId: string;
  courseTitle: string;
  currentLessonId: string;
  lessons: RailLesson[];
}) {
  const completed = lessons.filter((l) => l.completed).length;

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-6 overflow-hidden rounded-card border border-line bg-raised shadow-card">
        <div className="border-b border-line p-4">
          <h2 className="truncate text-sm font-semibold text-ink">{courseTitle}</h2>
          <p className="mt-1 text-xs text-muted tabular-nums">
            {completed} of {lessons.length} completed
          </p>
          <ProgressBar
            value={completionPercent(completed, lessons.length)}
            className="mt-2"
          />
        </div>

        <ol className="max-h-[60vh] overflow-y-auto p-2">
          {lessons.map((lesson) => {
            const current = lesson.id === currentLessonId;
            const inner = (
              <>
                {lesson.completed ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                ) : current ? (
                  <PlayCircle className="size-4 shrink-0 text-accent" aria-hidden />
                ) : lesson.locked ? (
                  <Lock className="size-4 shrink-0 text-subtle" aria-hidden />
                ) : (
                  <Circle className="size-4 shrink-0 text-subtle" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {lesson.position}. {lesson.title}
                </span>
                {lesson.duration_minutes > 0 && (
                  <span className="shrink-0 text-xs text-subtle tabular-nums">
                    {formatDuration(lesson.duration_minutes)}
                  </span>
                )}
              </>
            );

            return (
              <li key={lesson.id}>
                {lesson.locked ? (
                  <span className="flex items-center gap-2.5 rounded-control px-2 py-2 text-sm text-subtle">
                    {inner}
                  </span>
                ) : (
                  <Link
                    href={`/courses/${courseId}/lessons/${lesson.id}`}
                    aria-current={current ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-control px-2 py-2 text-sm transition-colors ${
                      current
                        ? "bg-accent-soft font-medium text-ink-accent"
                        : "text-muted hover:bg-hover hover:text-ink"
                    }`}
                  >
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
