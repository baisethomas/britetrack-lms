"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  Upload,
  Users,
} from "lucide-react";
import type { UserRole } from "@/lib/types";

const icons = {
  dashboard: LayoutDashboard,
  courses: BookOpen,
  notifications: Bell,
  users: Users,
  upload: Upload,
  chart: LineChart,
  cap: GraduationCap,
} as const;

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof icons;
}

export function navItemsFor(role: UserRole): NavItem[] {
  const common: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  ];
  if (role === "student") {
    common.push({ href: "/courses", label: "Courses", icon: "courses" });
  }
  if (role === "parent") {
    common.push({ href: "/children", label: "My children", icon: "chart" });
  }
  if (role === "admin") {
    common.push(
      { href: "/admin/courses", label: "Courses", icon: "courses" },
      { href: "/admin/users", label: "Users", icon: "users" },
      { href: "/admin/enrollments", label: "Bulk enroll", icon: "upload" },
    );
  }
  common.push({ href: "/notifications", label: "Notifications", icon: "notifications" });
  return common;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
      {items.map((item) => {
        const Icon = icons[item.icon];
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-brand-50 text-brand-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Icon className="size-4.5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
