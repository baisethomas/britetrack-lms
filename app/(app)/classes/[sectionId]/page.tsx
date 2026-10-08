import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Hammer, PlayCircle, Users, Video } from "lucide-react";
import {
  getRoster,
  getSection,
  getSectionOutline,
  getSectionViewRole,
  getUpcomingSessions,
  nextItem,
  requireSchool,
} from "@/lib/data";
import { removeEnrollment } from "@/lib/actions/school";
import { completionPercent } from "@/lib/progress";
import { gradeLabel } from "@/lib/types";
import { Badge, ButtonLink, Card, ProgressBar } from "@/components/ui";
import { Outline } from "@/components/outline";
import { SessionList } from "@/components/session-list";
import { RosterForm } from "./roster-form";

export default async function SectionPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  const ctx = await requireSchool();
  const [section, role] = await Promise.all([
    getSection(sectionId),
    getSectionViewRole(ctx, sectionId),
  ]);
  if (!section || !role) notFound();

  const isStaff = role === "admin" || role === "teacher" || role === "co_teacher" || role === "aide";
  const canManage = role === "admin" || role === "teacher" || role === "co_teacher";

  const [outline, sessions, roster] = await Promise.all([
    getSectionOutline(sectionId, role === "student" ? ctx.profile.id : undefined),
    getUpcomingSessions([sectionId], 10),
    isStaff ? getRoster(sectionId) : Promise.resolve([]),
  ]);
  const next = role === "student" ? nextItem(outline) : undefined;
  const pct = completionPercent(outline.completed, outline.total);
  const students = roster.filter((r) => r.role === "student");
  const staff = roster.filter((r) => r.role !== "student");

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted">
        <Link href="/classes" className="hover:text-ink">
          Classes
        </Link>
        <ChevronRight className="size-3.5 text-subtle" aria-hidden />
        <span className="truncate text-ink">{section.course.title}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display font-bold text-ink">{section.course.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {section.name} · {section.term.name}
            {section.course.subject && ` · ${section.course.subject}`}
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <ButtonLink href={`/classes/${sectionId}/build`} variant="secondary">
              <Hammer className="size-4" aria-hidden /> Build
            </ButtonLink>
          )}
          {next && (
            <ButtonLink href={`/classes/${sectionId}/items/${next.id}`}>
              <PlayCircle className="size-4" aria-hidden /> Continue
            </ButtonLink>
          )}
        </div>
      </div>

      {role === "student" && outline.total > 0 && (
        <Card>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink">Your progress</span>
            <span className="text-muted tabular-nums">
              {outline.completed} of {outline.total}
            </span>
          </div>
          <ProgressBar value={pct} tone={pct >= 100 ? "success" : "accent"} className="mt-3" />
        </Card>
      )}

      <div className={`grid gap-6 ${isStaff ? "lg:grid-cols-[1fr_320px]" : ""}`}>
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="mb-3 text-heading font-semibold">Course outline</h2>
            <Outline sectionId={sectionId} outline={outline} staff={isStaff} />
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-heading font-semibold">
              <Video className="size-5 text-accent" aria-hidden /> Live classes
            </h2>
            <SessionList
              sessions={sessions}
              showClass={false}
              empty={
                canManage
                  ? "No live classes scheduled. Add one from Build."
                  : "No live classes scheduled yet."
              }
            />
          </section>
        </div>

        {isStaff && (
          <aside className="space-y-4">
            <Card className="p-0">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <h2 className="flex items-center gap-2 font-semibold text-ink">
                  <Users className="size-4 text-accent" aria-hidden /> Roster
                </h2>
                <span className="text-xs text-muted tabular-nums">{students.length} students</span>
              </div>
              <ul className="divide-y divide-line">
                {staff.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <span className="truncate text-ink">{r.full_name || "Unnamed"}</span>
                    <Badge tone="success">{r.role.replace("_", "-")}</Badge>
                  </li>
                ))}
                {students.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate text-ink">{r.full_name || "Unnamed"}</div>
                      <div className="text-xs text-muted">
                        {r.grade_level !== null ? gradeLabel(r.grade_level) : ""}
                        {r.completed_at ? " · completed" : ""}
                      </div>
                    </div>
                    {canManage && (
                      <form action={removeEnrollment.bind(null, r.id, sectionId)}>
                        <button type="submit" className="text-xs text-subtle hover:text-danger">
                          Remove
                        </button>
                      </form>
                    )}
                  </li>
                ))}
                {students.length === 0 && (
                  <li className="px-5 py-3 text-sm text-muted">No students yet.</li>
                )}
              </ul>
            </Card>
            {canManage && <RosterForm sectionId={sectionId} />}
          </aside>
        )}
      </div>
    </div>
  );
}
