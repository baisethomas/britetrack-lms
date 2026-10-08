import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSchool } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { setCourseStatus } from "@/lib/actions/school";
import { gradeLabel, type Course, type Section, type Term } from "@/lib/types";
import { Badge, Button, Card } from "@/components/ui";
import { NewSectionForm } from "./new-section-form";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const ctx = await requireSchool();
  const supabase = await createClient();
  const [{ data: course }, { data: sections }, { data: terms }] = await Promise.all([
    supabase.from("courses").select("*").eq("id", courseId).maybeSingle(),
    supabase
      .from("sections")
      .select("*, terms!inner(id, name)")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false }),
    supabase.from("terms").select("*").eq("school_id", ctx.school.id).order("starts_on", { ascending: false }),
  ]);
  if (!course) notFound();
  const typed = course as Course;
  const canPublish = ctx.isAdmin || typed.created_by === ctx.profile.id;
  const sectionRows = (sections ?? []) as (Section & { terms: Pick<Term, "id" | "name"> })[];
  const termList = (terms ?? []) as Term[];

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-display font-bold">{typed.title}</h1>
              <Badge
                tone={typed.status === "published" ? "success" : typed.status === "draft" ? "warning" : "neutral"}
                className="capitalize"
              >
                {typed.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              {[
                typed.subject,
                typed.grade_levels.length ? typed.grade_levels.map(gradeLabel).join(", ") : null,
                typed.credits ? `${typed.credits} credits` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {canPublish && (
            <div className="flex gap-2">
              {typed.status !== "published" && (
                <form action={setCourseStatus.bind(null, courseId, "published")}>
                  <Button type="submit">Publish</Button>
                </form>
              )}
              {typed.status === "published" && (
                <form action={setCourseStatus.bind(null, courseId, "draft")}>
                  <Button type="submit" variant="secondary">
                    Unpublish
                  </Button>
                </form>
              )}
              {typed.status !== "archived" && (
                <form action={setCourseStatus.bind(null, courseId, "archived")}>
                  <Button type="submit" variant="ghost">
                    Archive
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>
        {typed.description && <p className="mt-3 max-w-2xl text-sm text-muted">{typed.description}</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-heading font-semibold">Class sections</h2>
          <Card className="divide-y divide-line p-0">
            {sectionRows.length === 0 && (
              <p className="p-6 text-sm text-muted">No sections yet — open the first one.</p>
            )}
            {sectionRows.map((section) => (
              <Link
                key={section.id}
                href={`/classes/${section.id}`}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-hover"
              >
                <div>
                  <div className="font-medium text-ink">{section.name}</div>
                  <div className="text-xs text-muted">{section.terms.name}</div>
                </div>
                {section.status === "archived" && <Badge tone="neutral">Archived</Badge>}
              </Link>
            ))}
          </Card>
        </div>
        <div>
          <h2 className="mb-3 text-heading font-semibold">Open a section</h2>
          {termList.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">
                Add a term first —{" "}
                <Link href="/admin/school" className="text-ink-accent hover:underline">
                  School settings
                </Link>
                .
              </p>
            </Card>
          ) : (
            <NewSectionForm courseId={courseId} terms={termList} isTeacher={ctx.isTeacher} />
          )}
        </div>
      </div>
    </div>
  );
}
