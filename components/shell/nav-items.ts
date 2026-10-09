/**
 * Pure navigation model, kept free of "use client" so the server layout can
 * compute the items and hand them to the client nav components as props.
 */
export type NavIcon =
  | "today"
  | "classes"
  | "children"
  | "people"
  | "courses"
  | "school"
  | "notifications";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

export interface NavRoles {
  isAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  isGuardian: boolean;
}

/**
 * Each role gets a different shape of app, not the same app with
 * permissions. A person with several roles sees the union.
 */
export function navItemsFor(roles: NavRoles): NavItem[] {
  const items: NavItem[] = [{ href: "/dashboard", label: "Today", icon: "today" }];
  if (roles.isStudent || roles.isTeacher) {
    items.push({ href: "/classes", label: "My classes", icon: "classes" });
  }
  if (roles.isGuardian) {
    items.push({ href: "/children", label: "My children", icon: "children" });
  }
  if (roles.isAdmin || roles.isTeacher) {
    items.push({ href: "/admin/courses", label: "Courses", icon: "courses" });
  }
  if (roles.isAdmin) {
    items.push(
      { href: "/admin/people", label: "People", icon: "people" },
      { href: "/admin/school", label: "School", icon: "school" },
    );
  }
  items.push({ href: "/notifications", label: "Notifications", icon: "notifications" });
  return items;
}
