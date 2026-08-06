import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getStreak } from "@/lib/data";
import type { Profile } from "@/lib/types";
import { Card, EmptyState, ProgressBar } from "@/components/ui";

export async function ParentDashboard({ profile }: { profile: Profile }) {
  const supabase = await createClient();

  const { data: links } = await supabase
    .from("parent_student_links")
    .select("student_id, profiles!parent_student_links_student_id_fkey(id, full_name)")
    .eq("parent_id", profile.id);

  const children = (links ?? [])
    .map((l) => l.profiles as unknown as Pick<Profile, "id" | "full_name">)
    .filter(Boolean);

  if (children.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Welcome, {profile.full_name.split(" ")[0]}</h1>
        <EmptyState
          icon={<Users className="size-10" aria-hidden />}
          title="No linked students yet"
          description="Ask your program administrator to link your account to your child's. Once linked, their courses and progress will show up here."
        />
      </div>
    );
  }

  const summaries = await Promise.all(
    children.map(async (child) => {
      const [{ data: enrollments }, { data: lessons }, { data: progress }, streak] =
        await Promise.all([
          supabase
            .from("enrollments")
            .select("*, courses(title)")
            .eq("student_id", child.id),
          supabase.from("lessons").select("id, course_id"),
          supabase
            .from("lesson_progress")
            .select("lesson_id, completed_at")
            .eq("student_id", child.id)
            .not("completed_at", "is", null),
          getStreak(child.id),
        ]);
      return { child, enrollments: enrollments ?? [], lessons: lessons ?? [], progress: progress ?? [], streak };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My children</h1>
        <p className="mt-1 text-sm text-slate-500">
          Course progress and learning activity for your linked students.
        </p>
      </div>

      {summaries.map(({ child, enrollments, lessons, progress, streak }) => {
        const completedIds = new Set(progress.map((p) => p.lesson_id));
        return (
          <Card key={child.id}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-semibold">{child.full_name}</h2>
              <span className="text-sm text-amber-700">
                🔥 {streak}-day streak
              </span>
            </div>
            {enrollments.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Not enrolled in any courses yet.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {enrollments.map((e) => {
                  const courseLessons = lessons.filter((l) => l.course_id === e.course_id);
                  const done = courseLessons.filter((l) => completedIds.has(l.id)).length;
                  const pct = courseLessons.length ? (done / courseLessons.length) * 100 : 0;
                  return (
                    <li key={e.id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium">{e.courses?.title}</span>
                        <span className="text-slate-500">
                          {done}/{courseLessons.length} lessons
                        </span>
                      </div>
                      <ProgressBar value={pct} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
