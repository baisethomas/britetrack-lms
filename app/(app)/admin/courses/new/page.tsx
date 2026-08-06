import type { Metadata } from "next";
import { NewCourseForm } from "./new-course-form";

export const metadata: Metadata = { title: "New course" };

export default function NewCoursePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New course</h1>
        <p className="mt-1 text-sm text-slate-500">
          Courses start as drafts — publish when the curriculum is ready.
        </p>
      </div>
      <NewCourseForm />
    </div>
  );
}
