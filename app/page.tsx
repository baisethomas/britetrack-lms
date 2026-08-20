import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, LineChart, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink, Card } from "@/components/ui";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2 text-lg font-bold">
          <GraduationCap className="size-6 text-accent" aria-hidden />
          BriteTrack
        </div>
        <nav className="flex items-center gap-3">
          <ButtonLink href="/login" variant="ghost">
            Sign in
          </ButtonLink>
          <ButtonLink href="/signup">Get started</ButtonLink>
        </nav>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Learning that keeps its momentum
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Structured courses, progressive lesson unlocking, live sessions, and
          progress every learner — and every parent — can actually see.
        </p>
        <ButtonLink href="/signup" className="px-6 py-3 text-base">
          Start learning
        </ButtonLink>
      </section>

      <section className="grid gap-4 pb-16 sm:grid-cols-3">
        <Card>
          <GraduationCap className="mb-3 size-6 text-accent" aria-hidden />
          <h2 className="font-semibold">Guided paths</h2>
          <p className="mt-1 text-sm text-muted">
            Lessons unlock in sequence so learners always know the next step.
          </p>
        </Card>
        <Card>
          <LineChart className="mb-3 size-6 text-accent" aria-hidden />
          <h2 className="font-semibold">Visible progress</h2>
          <p className="mt-1 text-sm text-muted">
            Streaks, completion rings, and course-level progress at a glance.
          </p>
        </Card>
        <Card>
          <Users className="mb-3 size-6 text-accent" aria-hidden />
          <h2 className="font-semibold">Built for families</h2>
          <p className="mt-1 text-sm text-muted">
            Parents follow along with linked accounts — no shared passwords.
          </p>
        </Card>
      </section>

      <footer className="border-t border-line py-6 text-center text-sm text-muted">
        <Link href="/login" className="hover:text-ink">
          BriteTrack LMS
        </Link>
      </footer>
    </main>
  );
}
