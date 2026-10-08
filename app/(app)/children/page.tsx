import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSchool } from "@/lib/data";
import { GuardianDashboard } from "../dashboard/guardian-dashboard";

export const metadata: Metadata = { title: "My children" };

export default async function ChildrenPage() {
  const ctx = await requireSchool();
  if (!ctx.isGuardian) redirect("/dashboard");
  return <GuardianDashboard ctx={ctx} />;
}
