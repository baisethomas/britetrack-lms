"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  Building2,
  Heart,
  LayoutDashboard,
  Library,
  Users,
} from "lucide-react";

import type { NavIcon, NavItem } from "./nav-items";

const icons: Record<NavIcon, typeof LayoutDashboard> = {
  today: LayoutDashboard,
  classes: BookOpen,
  children: Heart,
  people: Users,
  courses: Library,
  school: Building2,
  notifications: Bell,
};

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
      {items.map((item) => {
        const Icon = icons[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-accent-soft text-ink-accent"
                : "text-muted hover:bg-hover hover:text-ink"
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

/**
 * Mobile tab bar, pinned to the bottom where thumbs are. Every destination
 * gets a tab: the sidebar is hidden at this breakpoint, so anything omitted
 * here would be unreachable.
 */
export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 flex border-t border-line bg-raised pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => {
        const Icon = icons[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[0.6875rem] font-medium transition-colors ${
              active ? "text-ink-accent" : "text-subtle hover:text-ink"
            }`}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            <span className="w-full truncate text-center">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
