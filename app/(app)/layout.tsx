import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, LogOut } from "lucide-react";
import { getContext, initialsOf } from "@/lib/data";
import { signOut } from "@/lib/actions/auth";
import { switchSchool } from "@/lib/actions/onboarding";
import { createClient } from "@/lib/supabase/server";
import { NavLinks, NavTabs } from "@/components/shell/nav";
import { navItemsFor } from "@/components/shell/nav-items";
import { Badge } from "@/components/ui";

const ROLE_LABEL: Record<string, string> = {
  school_admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  guardian: "Guardian",
  staff: "Staff",
};

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await getContext();
  // No school yet: found one or accept an invitation first.
  if (!ctx.school) redirect("/onboarding");

  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  const items = navItemsFor(ctx);
  const roleLabels = [...ctx.roles].map((r) => ROLE_LABEL[r] ?? r);

  const schoolPicker =
    ctx.schools.length > 1 ? (
      <form
        action={async (formData: FormData) => {
          "use server";
          await switchSchool(String(formData.get("school_id")));
        }}
        className="mb-4 px-2"
      >
        <label htmlFor="school_id" className="sr-only">
          School
        </label>
        <select
          id="school_id"
          name="school_id"
          defaultValue={ctx.school.id}
          className="w-full rounded-control border border-line bg-raised px-2 py-1.5 text-sm"
        >
          {ctx.schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit" className="mt-1.5 text-xs text-accent hover:underline">
          Switch school
        </button>
      </form>
    ) : (
      <div className="mb-4 truncate px-2 text-xs text-muted">{ctx.school.name}</div>
    );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 flex-col border-r border-line bg-raised p-4 md:flex">
        <Link href="/dashboard" className="mb-2 flex items-center gap-2 px-2 font-bold">
          <GraduationCap className="size-6 text-accent" aria-hidden />
          BriteTrack
        </Link>
        {schoolPicker}
        <NavLinks items={items} />
        <div className="mt-auto border-t border-line pt-4">
          <div className="flex items-center gap-3 px-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-ink-accent">
              {initialsOf(ctx.profile.full_name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">
                {ctx.profile.full_name || "Unnamed"}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {roleLabels.map((label) => (
                  <Badge key={label} tone="neutral">
                    {label}
                  </Badge>
                ))}
              </div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                title="Sign out"
                className="rounded-control p-2 text-subtle hover:bg-hover hover:text-ink"
              >
                <LogOut className="size-4" aria-hidden />
                <span className="sr-only">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-raised px-4 py-3 md:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold">
            <GraduationCap className="size-5 text-accent" aria-hidden />
            <span>
              BriteTrack
              <span className="ml-2 text-xs font-normal text-muted">{ctx.school.name}</span>
            </span>
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-sm text-muted">
              Sign out
            </button>
          </form>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>

        <NavTabs items={items} />
      </div>
      {unread ? <span className="sr-only">{unread} unread notifications</span> : null}
    </div>
  );
}
