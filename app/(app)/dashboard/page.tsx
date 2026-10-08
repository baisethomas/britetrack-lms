import type { Metadata } from "next";
import { requireSchool } from "@/lib/data";
import { AdminDashboard } from "./admin-dashboard";
import { TeacherDashboard } from "./teacher-dashboard";
import { StudentDashboard } from "./student-dashboard";
import { GuardianDashboard } from "./guardian-dashboard";

export const metadata: Metadata = { title: "Today" };

/**
 * "Today" is a different screen for each role. A person with several roles
 * gets the most operational one: an admin who also teaches sees the school
 * and reaches their classes from the nav.
 */
export default async function DashboardPage() {
  const ctx = await requireSchool();
  if (ctx.isAdmin) return <AdminDashboard ctx={ctx} />;
  if (ctx.isTeacher) return <TeacherDashboard ctx={ctx} />;
  if (ctx.isStudent) return <StudentDashboard ctx={ctx} />;
  return <GuardianDashboard ctx={ctx} />;
}
