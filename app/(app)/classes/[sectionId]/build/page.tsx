import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, Eye, EyeOff, Trash2 } from "lucide-react";
import {
  getSection,
  getSectionOutline,
  getSectionViewRole,
  getUpcomingSessions,
  requireSchool,
} from "@/lib/data";
import {
  deleteItem,
  deleteLiveSession,
  deleteModule,
  setItemPublished,
  setModulePrerequisite,
  setModulePublished,
} from "@/lib/actions/sections";
import { Badge, Card } from "@/components/ui";
import { KIND_LABEL } from "@/components/outline";
import { formatStart } from "@/components/session-list";
import { AddItemForm, AddModuleForm, ScheduleSessionForm } from "./forms";

/**
 * The teacher's workbench: modules, items, publishing, prerequisites and live
 * sessions in one place. Students never see this route.
 */
export default async function BuildPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  const ctx = await requireSchool();
  const [section, role] = await Promise.all([getSection(sectionId), getSectionViewRole(ctx, sectionId)]);
  if (!section) notFound();
  if (!(role === "admin" || role === "teacher" || role === "co_teacher")) {
    redirect(`/classes/${sectionId}`);
  }

  const [outline, sessions] = await Promise.all([
    getSectionOutline(sectionId),
    getUpcomingSessions([sectionId], 20),
  ]);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted">
        <Link href="/classes" className="hover:text-ink">
          Classes
        </Link>
        <ChevronRight className="size-3.5 text-subtle" aria-hidden />
        <Link href={`/classes/${sectionId}`} className="truncate hover:text-ink">
          {section.course.title}
        </Link>
        <ChevronRight className="size-3.5 text-subtle" aria-hidden />
        <span className="text-ink">Build</span>
      </nav>

      <div>
        <h1 className="text-display font-bold text-ink">Build {section.course.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {section.name} · Modules unlock in order unless you set them free; drafts stay hidden
          from students until published.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          {outline.modules.length === 0 && (
            <Card>
              <p className="text-sm text-muted">Start with a module — a unit, a week, a chapter.</p>
            </Card>
          )}
          {outline.modules.map((module) => {
            const items = outline.items
              .filter((i) => i.module_id === module.id)
              .sort((a, b) => a.position - b.position);
            const others = outline.modules.filter((m) => m.id !== module.id);
            return (
              <Card key={module.id} className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-ink">
                      {module.position}. {module.title}
                    </h2>
                    <Badge tone={module.published ? "success" : "warning"}>
                      {module.published ? "Published" : "Draft"}
                    </Badge>
                    <span className="text-xs text-muted">
                      {module.unlock_mode === "sequential" ? "In order" : "Free order"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <form action={setModulePublished.bind(null, module.id, sectionId, !module.published)}>
                      <button
                        type="submit"
                        title={module.published ? "Unpublish module" : "Publish module"}
                        className="rounded-control p-2 text-subtle hover:bg-hover hover:text-ink"
                      >
                        {module.published ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                        <span className="sr-only">{module.published ? "Unpublish" : "Publish"}</span>
                      </button>
                    </form>
                    <form action={deleteModule.bind(null, module.id, sectionId)}>
                      <button
                        type="submit"
                        title="Delete module and its items"
                        className="rounded-control p-2 text-subtle hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="size-4" aria-hidden />
                        <span className="sr-only">Delete {module.title}</span>
                      </button>
                    </form>
                  </div>
                </div>

                {others.length > 0 && (
                  <form
                    action={setModulePrerequisite.bind(null, module.id, sectionId)}
                    className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2 text-xs text-muted"
                  >
                    <label htmlFor={`prereq-${module.id}`}>Opens after</label>
                    <select
                      id={`prereq-${module.id}`}
                      name="prerequisite_module_id"
                      defaultValue={module.prerequisite_module_id ?? ""}
                      className="rounded-control border border-line bg-raised px-2 py-1 text-xs"
                    >
                      <option value="">— nothing, always open —</option>
                      {others.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.position}. {m.title}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="font-medium text-accent hover:underline">
                      Save
                    </button>
                  </form>
                )}

                <ol className="divide-y divide-line">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={
                            item.kind === "quiz"
                              ? `/classes/${sectionId}/items/${item.id}/edit`
                              : `/classes/${sectionId}/items/${item.id}`
                          }
                          className="truncate font-medium text-ink hover:text-ink-accent hover:underline"
                        >
                          {item.position}. {item.title}
                        </Link>
                        <div className="text-xs text-muted">
                          {KIND_LABEL[item.kind]}
                          {!item.required && " · optional"}
                          {item.kind === "quiz" && ` · pass mark ${item.pass_mark}%`}
                        </div>
                      </div>
                      {!item.published && <Badge tone="warning">Draft</Badge>}
                      <form action={setItemPublished.bind(null, item.id, sectionId, !item.published)}>
                        <button
                          type="submit"
                          title={item.published ? "Unpublish" : "Publish"}
                          className="rounded-control p-2 text-subtle hover:bg-hover hover:text-ink"
                        >
                          {item.published ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                          <span className="sr-only">{item.published ? "Unpublish" : "Publish"}</span>
                        </button>
                      </form>
                      <form action={deleteItem.bind(null, item.id, sectionId)}>
                        <button
                          type="submit"
                          title="Delete item"
                          className="rounded-control p-2 text-subtle hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="size-4" aria-hidden />
                          <span className="sr-only">Delete {item.title}</span>
                        </button>
                      </form>
                    </li>
                  ))}
                </ol>
                <div className="border-t border-line p-4">
                  <AddItemForm moduleId={module.id} sectionId={sectionId} />
                </div>
              </Card>
            );
          })}
        </div>

        <aside className="space-y-4">
          <AddModuleForm sectionId={sectionId} />
          <ScheduleSessionForm sectionId={sectionId} />
          {sessions.length > 0 && (
            <Card className="p-0">
              <h2 className="border-b border-line px-5 py-3 font-semibold text-ink">Scheduled</h2>
              <ul className="divide-y divide-line">
                {sessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate text-ink">{s.title}</div>
                      <div className="text-xs text-muted">{formatStart(s.starts_at)}</div>
                    </div>
                    <form action={deleteLiveSession.bind(null, s.id, sectionId)}>
                      <button type="submit" className="text-xs text-subtle hover:text-danger">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
