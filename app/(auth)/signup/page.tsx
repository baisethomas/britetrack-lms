import type { Metadata } from "next";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <SignupForm next={next ? safeRedirectPath(next, "/onboarding") : undefined} />;
}
