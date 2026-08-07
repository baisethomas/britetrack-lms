import { redirect } from "next/navigation";
import { getProfile } from "@/lib/data";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await getProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return <>{children}</>;
}
