import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/data";
import { Eyebrow } from "@/components/ui";
import { AcceptInvitationForm, CreateSchoolForm } from "./onboarding-forms";

export const metadata: Metadata = { title: "Get started" };

/**
 * A new account is just an identity. It becomes something — an admin, a
 * teacher, a student, a guardian — by founding a school or accepting an
 * invitation, and that choice is this page.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const ctx = await getContext();
  if (ctx.schools.length > 0 && !invite) redirect("/dashboard");

  const first = ctx.profile.full_name.split(" ")[0] || "there";

  return (
    <div className="space-y-8">
      <div className="text-center">
        <Eyebrow>Welcome</Eyebrow>
        <h1 className="mt-2 text-display font-bold text-ink">Hi {first}, let&apos;s get you set up</h1>
        <p className="mt-2 text-sm text-muted">
          {invite
            ? "You've been invited to join a school."
            : "Join the school that invited you, or set up a new one."}
        </p>
      </div>

      {invite ? (
        <AcceptInvitationForm token={invite} />
      ) : (
        <div className="grid gap-6">
          <AcceptInvitationForm />
          <div className="relative text-center text-xs uppercase tracking-wide text-subtle">
            <span className="bg-surface px-3">or</span>
            <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-line" />
          </div>
          <CreateSchoolForm />
        </div>
      )}
    </div>
  );
}
