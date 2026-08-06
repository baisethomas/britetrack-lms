import type { Metadata } from "next";
import { getProfile } from "@/lib/data";
import { StudentDashboard } from "./student-dashboard";
import { AdminDashboard } from "./admin-dashboard";
import { ParentDashboard } from "./parent-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await getProfile();

  if (profile.role === "admin") return <AdminDashboard />;
  if (profile.role === "parent") return <ParentDashboard profile={profile} />;
  return <StudentDashboard profile={profile} />;
}
