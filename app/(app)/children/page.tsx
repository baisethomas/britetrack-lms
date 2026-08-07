import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/data";
import { ParentDashboard } from "../dashboard/parent-dashboard";

export const metadata: Metadata = { title: "My children" };

export default async function ChildrenPage() {
  const profile = await getProfile();
  if (profile.role !== "parent") redirect("/dashboard");
  return <ParentDashboard profile={profile} />;
}
