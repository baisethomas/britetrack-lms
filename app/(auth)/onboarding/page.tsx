import type { Metadata } from "next";
import { BookOpen, LineChart, Sparkles, Users } from "lucide-react";
import { getProfile } from "@/lib/data";
import { completeOnboarding } from "@/lib/actions/auth";
import { Button, Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const profile = await getProfile();

  const steps =
    profile.role === "parent"
      ? [
          {
            icon: Users,
            title: "Get linked to your child",
            body: "An administrator links your account to your child's — ask your school or program admin.",
          },
          {
            icon: LineChart,
            title: "Follow their progress",
            body: "See course completion, lesson activity, and streaks from your dashboard.",
          },
          {
            icon: Sparkles,
            title: "Stay in the loop",
            body: "Notifications tell you about live sessions and milestones as they happen.",
          },
        ]
      : [
          {
            icon: BookOpen,
            title: "Browse the catalog",
            body: "Enroll in a published course to start your path — the first lesson is always open.",
          },
          {
            icon: LineChart,
            title: "Learn in order",
            body: "Lessons unlock as you complete the previous one, so the next step is always clear.",
          },
          {
            icon: Sparkles,
            title: "Keep your streak",
            body: "Complete a lesson a day to build a streak and fill in your week.",
          },
        ];

  return (
    <div className="space-y-8">
      {/* Reference onboardings (Babbel, Codecademy) show where you are with a
          slim bar at the top; this flow is a single step, so it reads full. */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-track">
        <div className="h-full w-full rounded-full bg-accent" />
      </div>

      <div className="text-center">
        <Eyebrow>Welcome</Eyebrow>
        <h1 className="mt-2 text-display font-bold text-ink">
          Hi {profile.full_name.split(" ")[0] || "there"}, here&apos;s how
          BriteTrack works
        </h1>
      </div>

      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="flex gap-4 rounded-card border border-line bg-raised p-4 shadow-card"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <step.icon className="size-5" aria-hidden />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink">
                {i + 1}. {step.title}
              </div>
              <p className="mt-1 text-sm text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <form action={completeOnboarding}>
        <Button type="submit" className="w-full py-3">
          Go to my dashboard
        </Button>
      </form>
    </div>
  );
}
