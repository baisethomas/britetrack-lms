import Link from "next/link";
import { Heart, Video } from "lucide-react";
import {
  getChildren,
  getSectionOutline,
  getStreakSummary,
  getUpcomingSessions,
  type AppContext,
} from "@/lib/data";
import { completionPercent } from "@/lib/progress";
import { gradeLabel, type School } from "@/lib/types";
import { Card, EmptyState, ProgressBar, StreakDots } from "@/components/ui";
import { SessionList } from "@/components/session-list";

/**
 * A guardian's view is read-mostly: each child, each class, how far along,
 * and what's coming up. No module trees to learn.
 */
export async function GuardianDashboard({ ctx }: { ctx: AppContext & { school: School } }) {
  const children = await getChildren(ctx.profile.id);

  if (children.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-display font-bold">Welcome, {ctx.profile.full_name.split(" ")[0]}</h1>
        <EmptyState
          icon={<Heart className="size-10" aria-hidden />}
          title="No students linked yet"
          description="Your school links your account to your child's when it invites you. Once that's done, their classes and progress show up here."
        />
      </div>
    );
  }

  const summaries = await Promise.all(
    children.map(async (child) => {
      const [outlines, streak, sessions] = await Promise.all([
        Promise.all(child.sections.map((s) => getSectionOutline(s.id, child.profile.id))),
        getStreakSummary(child.profile.id),
        getUpcomingSessions(child.sections.map((s) => s.id), 3),
      ]);
      return { child, outlines, streak, sessions };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display font-bold text-ink">My children</h1>
        <p className="mt-1 text-sm text-muted">Progress and upcoming classes for each student.</p>
      </div>

      {summaries.map(({ child, outlines, streak, sessions }) => (
        <Card key={child.profile.id}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-heading font-semibold text-ink">{child.profile.full_name}</h2>
              {child.student && (
                <p className="text-sm text-muted">{gradeLabel(child.student.grade_level)}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-streak">
                {streak.streak > 0 ? `${streak.streak}-day streak` : "No streak yet"}
              </span>
              <StreakDots days={streak.days} />
            </div>
          </div>

          {child.sections.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Not in any classes yet.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {child.sections.map((section, i) => {
                const outline = outlines[i];
                const pct = completionPercent(outline.completed, outline.total);
                return (
                  <li key={section.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <Link href={`/classes/${section.id}`} className="font-medium text-ink hover:underline">
                        {section.course.title}
                        <span className="ml-2 font-normal text-muted">{section.name}</span>
                      </Link>
                      <span className="text-muted tabular-nums">
                        {outline.completed}/{outline.total}
                      </span>
                    </div>
                    <ProgressBar value={pct} tone={pct >= 100 ? "success" : "accent"} />
                  </li>
                );
              })}
            </ul>
          )}

          {sessions.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <Video className="size-4 text-accent" aria-hidden /> Upcoming live classes
              </h3>
              <SessionList sessions={sessions} empty="" />
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
