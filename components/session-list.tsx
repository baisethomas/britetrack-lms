import { Video } from "lucide-react";
import type { LiveSession } from "@/lib/types";
import { ButtonLink, Card } from "@/components/ui";

export type SessionRow = LiveSession & { section_name: string; course_title: string; live: boolean };

const PROVIDER_LABEL: Record<LiveSession["provider"], string> = {
  zoom: "Zoom",
  google_meet: "Google Meet",
  external: "Meeting link",
};

/** When a session starts, in the viewer's local time. */
export function formatStart(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Live sessions with one-tap join — the whole point is that nobody hunts for a link. */
export function SessionList({
  sessions,
  empty,
  showClass = true,
}: {
  sessions: SessionRow[];
  empty: string;
  showClass?: boolean;
}) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted">{empty}</p>;
  }
  return (
    <Card className="divide-y divide-line p-0">
      {sessions.map((s) => {
        const live = s.live;
        return (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <Video className="size-4 shrink-0 text-accent" aria-hidden />
                <span className="truncate">{s.title}</span>
                {live && (
                  <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">
                    Live now
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {formatStart(s.starts_at)} · {s.duration_minutes} min · {PROVIDER_LABEL[s.provider]}
                {showClass && ` · ${s.course_title} — ${s.section_name}`}
              </div>
            </div>
            {s.join_url ? (
              <ButtonLink href={s.join_url} target="_blank" rel="noopener" variant={live ? "primary" : "secondary"}>
                Join
              </ButtonLink>
            ) : s.recording_url ? (
              <ButtonLink href={s.recording_url} target="_blank" rel="noopener" variant="secondary">
                Recording
              </ButtonLink>
            ) : null}
          </div>
        );
      })}
    </Card>
  );
}
