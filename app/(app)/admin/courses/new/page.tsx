import type { Metadata } from "next";
import { requireSchool } from "@/lib/data";
import { NewCourseForm } from "./new-course-form";

export const metadata: Metadata = { title: "New course" };

export default async function NewCoursePage() {
  const ctx = await requireSchool();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-display font-bold">New course</h1>
        <p className="mt-1 text-sm text-muted">
          A course is the catalog entry; classes are sections of it, each with its own
          teacher and roster.
        </p>
      </div>
      <NewCourseForm gradeMin={ctx.school.grade_min} gradeMax={ctx.school.grade_max} />
    </div>
  );
}
