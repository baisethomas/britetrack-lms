import { redirect } from "next/navigation";
import { requireSchool } from "@/lib/data";

/**
 * Courses are shared between admins and teachers; People and School are
 * admin-only and check again themselves. RLS is the actual guard — this
 * keeps a student from landing on an empty admin page.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireSchool();
  if (!ctx.isAdmin && !ctx.isTeacher) redirect("/dashboard");
  return <>{children}</>;
}
