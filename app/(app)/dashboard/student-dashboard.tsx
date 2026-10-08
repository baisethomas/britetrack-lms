import Link from "next/link";
import { BookOpen, Flame, PlayCircle, Video } from "lucide-react";
import {
  getMySections,
  getSectionOutline,
  getStreakSummary,
  getUpcomingSessions,
  nextItem,
  type AppContext,
} from "@/lib/data";
import { completionPercent } from "@/lib/progress";
import type { School } from "@/lib/types";
import { ButtonLink, Card, EmptyState, ProgressBar, StreakDots } from "@/components/ui";
import { SessionList } from "@/components/session-list";

/**
 * A student's "Today": one card per class with the next thing to do, live
 * classes coming up, and the streak. Nothing to navigate, nothing to decide.
 */
export async function StudentDashboard({ ctx }: { ctx: AppContext & { school: School } }) {
  const sections = (await getMySections(ctx)).filter((s) => s.my_role === "student");
  const [outlines, sessions, { streak, days }] = await Promise.all([
    Promise.all(sections.map((s) => getSectionOutline(s.id, ctx.profile.id))),
    getUpcomingSessions(sections.map((s) => s.id)),
    getStreakSummary(ctx.profile.id),
  ]);

  const first = ctx.profile.full_name.split(" ")[0] || "there";
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{todayLabel}</p>
          <h1 className="text-display font-bold">Hi {first}</h1>
        </div>
        <Card className="flex items-center gap-4 px-5 py-3">
          <Flame className={`size-6 ${streak > 0 ? "text-streak" : "text-subtle"}`} aria-hidden />
          <div>
            <div className="text-sm font-semibold text-ink">
              {streak > 0 ? `${streak}-day streak` : "Start a streak"}
            </div>
            <StreakDots days={days} />
          </div>
        </Card>
      </div>

      {sessions.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-heading font-semibold">
            <Video className="size-5 text-accent" aria-hidden /> Live classes
          </h2>
          <SessionList sessions={sessions} empty="" />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-heading font-semibold">Your classes</h2>
        {sections.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="size-10" aria-hidden />}
            title="No classes yet"
            description="Your teacher or school will add you to your classes. Check back soon."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sections.map((section, i) => {
              const outline = outlines[i];
              const next = nextItem(outline);
              const pct = completionPercent(outline.completed, outline.total);
              const done = outline.total > 0 && outline.completed === outline.total;
              return (
                <Card key={section.id} className="flex flex-col">
                  <Link
                    href={`/classes/${section.id}`}
                    className="text-heading font-semibold text-ink hover:text-ink-accent hover:underline"
                  >
                    {section.course.title}
                  </Link>
                  <div className="mt-0.5 text-sm text-muted">{section.name}</div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted tabular-nums">
                    <span>
                      {outline.completed} of {outline.total} done
                    </span>
                    <span>{Math.round(pct)}%</span>
                  </div>
                  <ProgressBar value={pct} tone={done ? "success" : "accent"} className="mt-1.5" />
                  <div className="mt-4">
                    {next ? (
                      <ButtonLink href={`/classes/${section.id}/items/${next.id}`} className="w-full">
                        <PlayCircle className="size-4" aria-hidden />
                        <span className="truncate">Continue: {next.title}</span>
                      </ButtonLink>
                    ) : (
                      <ButtonLink href={`/classes/${section.id}`} variant="secondary" className="w-full">
                        {done ? "All done — review" : "Open class"}
                      </ButtonLink>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
