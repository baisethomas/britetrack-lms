import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, LogOut } from "lucide-react";
import { getProfile } from "@/lib/data";
import { signOut } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { NavLinks, NavTabs, navItemsFor } from "@/components/shell/nav";
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
      <aside className="sticky top-0 hidden h-dvh w-60 flex-col border-r border-line bg-raised p-4 md:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2 font-bold">
          <GraduationCap className="size-6 text-accent" aria-hidden />
          BriteTrack
        </Link>
        <NavLinks items={items} />
        <div className="mt-auto border-t border-line pt-4">
          <div className="flex items-center gap-3 px-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-ink-accent">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">{profile.full_name}</div>
              <Badge tone="neutral" className="mt-0.5 capitalize">
                {profile.role}
              </Badge>
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
        {/* Mobile top bar */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-raised px-4 py-3 md:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold">
            <GraduationCap className="size-5 text-accent" aria-hidden />
            BriteTrack
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-sm text-muted">
              Sign out
            </button>
          </form>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>

        <NavTabs items={items} />
      </div>
      {unread ? <span className="sr-only">{unread} unread notifications</span> : null}
    </div>
  );
}
