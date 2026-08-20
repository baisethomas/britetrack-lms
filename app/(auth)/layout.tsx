import Link from "next/link";
import { GraduationCap } from "lucide-react";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-12">
      <Link href="/" className="flex items-center gap-2 text-lg font-bold">
        <GraduationCap className="size-6 text-accent" aria-hidden />
        BriteTrack
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
