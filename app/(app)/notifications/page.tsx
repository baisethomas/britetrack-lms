import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { getProfile } from "@/lib/data";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/actions/learning";
import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/lib/types";
import { Button, Card, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await getProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  const notifications = (data ?? []) as Notification[];
  const hasUnread = notifications.some((n) => !n.read_at);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enrollment updates, live sessions, and milestones.
          </p>
        </div>
        {hasUnread && (
          <form action={markAllNotificationsRead}>
            <Button type="submit" variant="secondary">
              Mark all read
            </Button>
          </form>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-10" aria-hidden />}
          title="Nothing here yet"
          description="You'll see updates about your courses and live sessions as they happen."
        />
      ) : (
        <Card className="divide-y divide-slate-100 p-0">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 px-5 py-4 ${
                n.read_at ? "opacity-60" : ""
              }`}
            >
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${
                  n.read_at ? "bg-slate-200" : "bg-brand-600"
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{n.title}</div>
                {n.body && <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>}
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                  <time dateTime={n.created_at}>
                    {new Date(n.created_at).toLocaleString()}
                  </time>
                  {n.href && (
                    <Link href={n.href} className="text-brand-600 hover:underline">
                      View
                    </Link>
                  )}
                </div>
              </div>
              {!n.read_at && (
                <form action={markNotificationRead.bind(null, n.id)}>
                  <button
                    type="submit"
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Mark read
                  </button>
                </form>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
