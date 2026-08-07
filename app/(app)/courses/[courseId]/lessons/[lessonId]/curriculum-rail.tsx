import Link from "next/link";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { Card } from "@/components/ui";

interface RailLesson {
  id: string;
  title: string;
  position: number;
  completed: boolean;
  locked: boolean;
}

export function CurriculumRail({
  courseId,
  currentLessonId,
  lessons,
}: {
  courseId: string;
  currentLessonId: string;
  lessons: RailLesson[];
}) {
  return (
    <aside className="hidden lg:block">
      <Card className="sticky top-6 p-3">
        <h2 className="px-2 pt-1 pb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Course content
        </h2>
        <ol className="space-y-0.5">
          {lessons.map((l) => {
            const current = l.id === currentLessonId;
            const inner = (
              <span className="flex items-center gap-2.5">
                {l.completed ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden />
                ) : l.locked ? (
                  <Lock className="size-4 shrink-0 text-slate-300" aria-hidden />
                ) : (
                  <Circle className="size-4 shrink-0 text-slate-300" aria-hidden />
                )}
                <span className="truncate">
                  {l.position}. {l.title}
                </span>
              </span>
            );
            return (
              <li key={l.id}>
                {l.locked ? (
                  <span className="block rounded-lg px-2 py-1.5 text-sm text-slate-400">
                    {inner}
                  </span>
                ) : (
                  <Link
                    href={`/courses/${courseId}/lessons/${l.id}`}
                    aria-current={current ? "page" : undefined}
                    className={`block rounded-lg px-2 py-1.5 text-sm ${
                      current
                        ? "bg-brand-50 font-medium text-brand-700"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </Card>
    </aside>
  );
}
