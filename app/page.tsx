import Link from "next/link";
import { GraduationCap, Heart, School, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui";

const pillars = [
  {
    icon: School,
    title: "Built for schools",
    body: "Terms, courses, class sections and rosters — a teacher owns their classes and nobody else's.",
  },
  {
    icon: Users,
    title: "Simple for students",
    body: "One screen that says what's next. Lessons open in order, quizzes grade themselves, live classes are one tap away.",
  },
  {
    icon: Heart,
    title: "Parents as first-class users",
    body: "Families see every class, how far along their child is, and what's coming up — without learning a module tree.",
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2 text-lg font-bold">
          <GraduationCap className="size-6 text-accent" aria-hidden />
          BriteTrack
        </div>
        <div className="flex items-center gap-3">
          <ButtonLink href="/login" variant="ghost">
            Sign in
          </ButtonLink>
          <ButtonLink href="/signup">Get started</ButtonLink>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          The K-12 learning platform families actually like
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Classes, lessons, quizzes and live sessions for your school — easy enough for a
          kindergartener, clear enough for a parent, fast enough for a teacher.
        </p>
        <ButtonLink href="/signup" className="px-6 py-3 text-base">
          Set up your school
        </ButtonLink>
        <p className="text-sm text-muted">
          Invited by a school?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>{" "}
          and paste your invitation.
        </p>
      </main>

      <section className="grid gap-4 pb-16 sm:grid-cols-3">
        {pillars.map((p) => (
          <div key={p.title} className="rounded-card border border-line bg-raised p-5 shadow-card">
            <p.icon className="mb-3 size-6 text-accent" aria-hidden />
            <h2 className="font-semibold text-ink">{p.title}</h2>
            <p className="mt-1 text-sm text-muted">{p.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
