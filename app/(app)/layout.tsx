import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, LogOut } from "lucide-react";
import { getProfile } from "@/lib/data";
import { signOut } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { NavLinks, navItemsFor } from "@/components/shell/nav";
import { Badge } from "@/components/ui";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await getProfile();
  if (!profile.onboarded) redirect("/onboarding");

  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  const items = navItemsFor(profile.role);
  const initials =
    profile.full_name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2 font-bold">
          <GraduationCap className="size-6 text-brand-600" aria-hidden />
          BriteTrack
        </Link>
        <NavLinks items={items} />
        <div className="mt-auto border-t border-slate-100 pt-4">
          <div className="flex items-center gap-3 px-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{profile.full_name}</div>
              <Badge tone="slate" className="mt-0.5 capitalize">
                {profile.role}
              </Badge>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                title="Sign out"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <LogOut className="size-4" aria-hidden />
                <span className="sr-only">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold">
            <GraduationCap className="size-5 text-brand-600" aria-hidden />
            BriteTrack
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-sm text-slate-500">
              Sign out
            </button>
          </form>
        </header>

        {/* Mobile nav below the top bar */}
        <div className="border-b border-slate-200 bg-white px-2 py-2 md:hidden">
          <NavLinks items={items} />
        </div>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>
      {unread ? <span className="sr-only">{unread} unread notifications</span> : null}
    </div>
  );
}
