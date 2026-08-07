import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";
import { BulkEnrollForm } from "./bulk-enroll-form";

export const metadata: Metadata = { title: "Bulk enrollment" };

export default async function AdminEnrollmentsPage() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title")
    .eq("status", "published")
    .order("title");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bulk enrollment</h1>
        <p className="mt-1 text-sm text-slate-500">
          Paste student emails (one per line) to enroll them into a course.
          Students must already have accounts.
        </p>
      </div>
      <BulkEnrollForm courses={(courses ?? []) as Pick<Course, "id" | "title">[]} />
    </div>
  );
}
