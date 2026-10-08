import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Lock,
  Pencil,
} from "lucide-react";
import {
  getSection,
  getSectionOutline,
  getSectionViewRole,
  getUpcomingSessions,
  requireSchool,
} from "@/lib/data";
import { completeItem, startItem } from "@/lib/actions/learning";
import { createClient } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/progress";
import { countAttempts, getAttemptReview, getLatestAttempt, getQuiz } from "@/lib/quiz";
import type { ModuleItem } from "@/lib/types";
import { Badge, Button, ButtonLink, Card } from "@/components/ui";
import { KIND_LABEL, Outline } from "@/components/outline";
import { SessionList } from "@/components/session-list";
import { QuizPlayer } from "./quiz-player";
import { QuizResults } from "./quiz-results";

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ sectionId: string; itemId: string }>;
  searchParams: Promise<{ retake?: string }>;
}) {
  const { sectionId, itemId } = await params;
  const { retake } = await searchParams;
  const ctx = await requireSchool();
  const [section, role] = await Promise.all([getSection(sectionId), getSectionViewRole(ctx, sectionId)]);
  if (!section || !role) notFound();

  const isStudent = role === "student";
  const isStaff = role === "admin" || role === "teacher" || role === "co_teacher" || role === "aide";
  const canManage = role === "admin" || role === "teacher" || role === "co_teacher";

  const outline = await getSectionOutline(sectionId, isStudent ? ctx.profile.id : undefined);
  const order = new Map(outline.modules.map((m, i) => [m.id, i]));
  const sequence = [...outline.items]
    .filter((i) => i.published || isStaff)
    .sort(
      (a, b) =>
        (order.get(a.module_id) ?? 0) - (order.get(b.module_id) ?? 0) || a.position - b.position,
    );
  const index = sequence.findIndex((i) => i.id === itemId);
  if (index === -1) notFound();
  const summary = sequence[index];

  if (summary.locked && !isStaff) {
    return (
      <Card className="mx-auto max-w-lg py-12 text-center">
        <Lock className="mx-auto size-10 text-subtle" aria-hidden />
        <h1 className="mt-4 text-heading font-semibold text-ink">Not unlocked yet</h1>
        <p className="mt-1 text-sm text-muted">Finish the items before this one to open it.</p>
        <ButtonLink href={`/classes/${sectionId}`} variant="secondary" className="mt-4">
          Back to class
        </ButtonLink>
      </Card>
    );
  }

  // The body lives behind RLS (can_access_item); a guardian reads only the
  // catalog, so this comes back empty for them and the page says so.
  const supabase = await createClient();
  const { data: full } = await supabase.from("module_items").select("*").eq("id", itemId).maybeSingle();
  const item = (full as ModuleItem | null) ?? null;

  if (isStudent && !summary.completed) await startItem(itemId);

  const prev = index > 0 ? sequence[index - 1] : null;
  const next = index < sequence.length - 1 ? sequence[index + 1] : null;

  const isQuiz = summary.kind === "quiz";
  const questions = isQuiz && item ? await getQuiz(itemId) : [];
  const latestAttempt =
    isQuiz && isStudent && questions.length > 0 ? await getLatestAttempt(itemId, ctx.profile.id) : null;
  const showResults = Boolean(latestAttempt) && retake !== "1";
  const [review, attemptCount] = latestAttempt
    ? await Promise.all([getAttemptReview(latestAttempt.id), countAttempts(itemId, ctx.profile.id)])
    : [[], 0];
  const sessions = summary.kind === "live_session" ? await getUpcomingSessions([sectionId], 10) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-6 max-h-[80vh] overflow-y-auto">
          <Outline sectionId={sectionId} outline={outline} currentItemId={itemId} staff={isStaff} />
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted">
          <Link href="/classes" className="hover:text-ink">
            Classes
          </Link>
          <ChevronRight className="size-3.5 text-subtle" aria-hidden />
          <Link href={`/classes/${sectionId}`} className="truncate hover:text-ink">
            {section.course.title}
          </Link>
          <ChevronRight className="size-3.5 text-subtle" aria-hidden />
          <span className="truncate text-ink">{summary.title}</span>
        </nav>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-title font-bold text-ink">{summary.title}</h1>
            <div className="flex shrink-0 items-center gap-2">
              {summary.completed && (
                <Badge tone="success">
                  <CheckCircle2 className="mr-1 size-3.5" aria-hidden /> Done
                </Badge>
              )}
              {canManage && isQuiz && (
                <ButtonLink href={`/classes/${sectionId}/items/${itemId}/edit`} variant="ghost">
                  <Pencil className="size-4" aria-hidden /> Edit quiz
                </ButtonLink>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-subtle">
            <span>{KIND_LABEL[summary.kind]}</span>
            {summary.duration_minutes > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                {formatDuration(summary.duration_minutes)}
              </span>
            )}
            {!summary.required && <span>Optional</span>}
          </div>
          {summary.summary && <p className="mt-3 text-sm text-muted">{summary.summary}</p>}

          {!item && (
            <p className="mt-4 text-sm text-muted">
              The content itself is for students in the class; you can see where they are from the outline.
            </p>
          )}

          {item?.kind === "video" && item.video_url && (
            <div className="mt-4 aspect-video overflow-hidden rounded-card bg-sunken">
              <iframe
                src={item.video_url}
                title={summary.title}
                className="size-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {item?.kind === "link" && item.url && (
            <ButtonLink href={item.url} target="_blank" rel="noopener" className="mt-4">
              <ExternalLink className="size-4" aria-hidden /> Open link
            </ButtonLink>
          )}

          {item?.content && (
            <div className="mt-5 text-sm leading-relaxed whitespace-pre-wrap text-ink">{item.content}</div>
          )}
        </Card>

        {summary.kind === "live_session" && (
          <SessionList sessions={sessions} showClass={false} empty="No live classes scheduled yet." />
        )}

        {isQuiz &&
          item &&
          (questions.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">
                {canManage ? "This quiz has no questions yet — add some from Edit quiz." : "This quiz isn't ready yet. Check back soon."}
              </p>
            </Card>
          ) : !isStudent ? (
            <Card>
              <p className="text-sm text-muted">
                {questions.length} question{questions.length === 1 ? "" : "s"} · pass mark {summary.pass_mark}%.
                Students take it here.
              </p>
            </Card>
          ) : showResults && latestAttempt ? (
            <QuizResults
              attempt={latestAttempt}
              review={review}
              passMark={summary.pass_mark}
              retakeHref={`/classes/${sectionId}/items/${itemId}?retake=1`}
              attemptCount={attemptCount}
              itemCompleted={summary.completed}
            />
          ) : (
            <QuizPlayer itemId={itemId} sectionId={sectionId} passMark={summary.pass_mark} questions={questions} />
          ))}

        <div className="flex items-center justify-between gap-3">
          {prev ? (
            <ButtonLink href={`/classes/${sectionId}/items/${prev.id}`} variant="secondary">
              <ArrowLeft className="size-4" aria-hidden /> Previous
            </ButtonLink>
          ) : (
            <span />
          )}

          {isStudent && !isQuiz && !summary.completed && item ? (
            <form action={completeItem.bind(null, itemId, sectionId)}>
              <Button type="submit">
                <CheckCircle2 className="size-4" aria-hidden />
                Mark done{next ? " & continue" : ""}
              </Button>
            </form>
          ) : next && (!next.locked || isStaff) ? (
            <ButtonLink href={`/classes/${sectionId}/items/${next.id}`}>
              Next <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          ) : (
            <ButtonLink href={`/classes/${sectionId}`} variant="secondary">
              Back to class
            </ButtonLink>
          )}
        </div>
      </div>
    </div>
  );
}
