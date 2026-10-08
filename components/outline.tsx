import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  ClipboardList,
  FileText,
  Link as LinkIcon,
  Lock,
  PlayCircle,
  Video,
} from "lucide-react";
import type { SectionOutline } from "@/lib/data";
import { formatDuration } from "@/lib/progress";
import type { ItemKind } from "@/lib/types";
import { Badge, Card } from "@/components/ui";

const KIND_ICON: Record<ItemKind, typeof FileText> = {
  page: FileText,
  video: PlayCircle,
  quiz: ClipboardList,
  live_session: Video,
  link: LinkIcon,
};

export const KIND_LABEL: Record<ItemKind, string> = {
  page: "Reading",
  video: "Video",
  quiz: "Quiz",
  live_session: "Live class",
  link: "Link",
};

/**
 * A section's modules and items. For a student, locked items are inert and
 * finished ones ticked; for staff everything is a link and drafts are marked.
 */
export function Outline({
  sectionId,
  outline,
  currentItemId,
  staff = false,
}: {
  sectionId: string;
  outline: SectionOutline;
  currentItemId?: string;
  staff?: boolean;
}) {
  if (outline.modules.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">
          {staff ? "No modules yet — add the first one from Build." : "Nothing here yet. Your teacher is still setting this class up."}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {outline.modules.map((module) => {
        const items = outline.items
          .filter((i) => i.module_id === module.id)
          .sort((a, b) => a.position - b.position);
        const done = items.filter((i) => i.required && i.completed).length;
        const required = items.filter((i) => i.required).length;
        return (
          <Card key={module.id} className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <h3 className="font-semibold text-ink">
                {module.position}. {module.title}
              </h3>
              <div className="flex items-center gap-2 text-xs text-muted">
                {!module.published && <Badge tone="warning">Draft</Badge>}
                {!staff && !module.reachable && <Badge tone="neutral">Locked</Badge>}
                {module.unlock_mode === "sequential" && <span>In order</span>}
                {required > 0 && (
                  <span className="tabular-nums">
                    {done}/{required}
                  </span>
                )}
              </div>
            </div>
            <ol className="divide-y divide-line">
              {items.length === 0 && (
                <li className="px-5 py-3 text-sm text-muted">No items yet.</li>
              )}
              {items.map((item) => {
                const Icon = KIND_ICON[item.kind];
                const current = item.id === currentItemId;
                const inner = (
                  <>
                    {item.completed ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                    ) : item.locked ? (
                      <Lock className="size-4 shrink-0 text-subtle" aria-hidden />
                    ) : (
                      <Circle className="size-4 shrink-0 text-subtle" aria-hidden />
                    )}
                    <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {!item.required && <span className="text-xs text-subtle">optional</span>}
                    {staff && !item.published && <Badge tone="warning">Draft</Badge>}
                    {item.duration_minutes > 0 && (
                      <span className="shrink-0 text-xs text-subtle tabular-nums">
                        {formatDuration(item.duration_minutes)}
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={item.id}>
                    {item.locked && !staff ? (
                      <span className="flex items-center gap-2.5 px-5 py-3 text-sm text-subtle">
                        {inner}
                      </span>
                    ) : (
                      <Link
                        href={`/classes/${sectionId}/items/${item.id}`}
                        aria-current={current ? "page" : undefined}
                        className={`flex items-center gap-2.5 px-5 py-3 text-sm transition-colors ${
                          current
                            ? "bg-accent-soft font-medium text-ink-accent"
                            : "text-ink hover:bg-hover"
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
        );
      })}
    </div>
  );
}
