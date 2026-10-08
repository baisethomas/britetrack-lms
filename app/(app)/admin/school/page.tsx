import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { requireSchool } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { gradeLabel, type Organization, type Term } from "@/lib/types";
import { Card } from "@/components/ui";
import { TermForm } from "./term-form";

export const metadata: Metadata = { title: "School" };

export default async function SchoolPage() {
  const ctx = await requireSchool();
  if (!ctx.isAdmin) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: org }, { data: terms }] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", ctx.school.organization_id).maybeSingle(),
    supabase.from("terms").select("*").eq("school_id", ctx.school.id).order("starts_on", { ascending: false }),
  ]);
  const organization = org as Organization | null;
  const termList = (terms ?? []) as Term[];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display font-bold">{ctx.school.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {organization && organization.name !== ctx.school.name ? `${organization.name} · ` : ""}
          {gradeLabel(ctx.school.grade_min)} – {gradeLabel(ctx.school.grade_max)} · {ctx.school.timezone}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-heading font-semibold">
            <CalendarDays className="size-5 text-accent" aria-hidden /> Terms
          </h2>
          <Card className="divide-y divide-line p-0">
            {termList.length === 0 && (
              <p className="p-6 text-sm text-muted">
                No terms yet. Every class belongs to a term — add this year&apos;s first.
              </p>
            )}
            {termList.map((term) => {
              const current = term.starts_on <= today && today <= term.ends_on;
              return (
                <div key={term.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <div className="font-medium text-ink">{term.name}</div>
                    <div className="text-xs text-muted">
                      {term.starts_on} → {term.ends_on}
                    </div>
                  </div>
                  {current && (
                    <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                      Current
                    </span>
                  )}
                </div>
              );
            })}
          </Card>
        </div>
        <div>
          <h2 className="mb-3 text-heading font-semibold">Add a term</h2>
          <TermForm />
        </div>
      </div>
    </div>
  );
}
