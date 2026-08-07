import type { Metadata } from "next";
import { BookOpen, LineChart, Sparkles, Users } from "lucide-react";
import { getProfile } from "@/lib/data";
import { completeOnboarding } from "@/lib/actions/auth";
import { Button, Card } from "@/components/ui";

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
            body: "Complete a lesson a day to build a streak and watch your progress ring fill up.",
          },
        ];

  return (
    <Card>
      <h1 className="text-xl font-semibold">
        Welcome, {profile.full_name.split(" ")[0] || "there"} 👋
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Here is how BriteTrack works, in three steps.
      </p>
      <ol className="mt-6 space-y-4">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <step.icon className="size-4" aria-hidden />
            </div>
            <div>
              <div className="text-sm font-medium">
                {i + 1}. {step.title}
              </div>
              <p className="mt-0.5 text-sm text-slate-500">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <form action={completeOnboarding} className="mt-6">
        <Button type="submit" className="w-full">
          Go to my dashboard
        </Button>
      </form>
    </Card>
  );
}
