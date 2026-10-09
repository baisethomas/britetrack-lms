import { describe, expect, it } from "vitest";
import { navItemsFor, type NavRoles } from "@/components/shell/nav-items";

const nobody: NavRoles = { isAdmin: false, isTeacher: false, isStudent: false, isGuardian: false };
const hrefs = (roles: Partial<NavRoles>) => navItemsFor({ ...nobody, ...roles }).map((i) => i.href);

describe("navItemsFor", () => {
  it("always starts with Today and ends with Notifications", () => {
    for (const roles of [
      {},
      { isStudent: true },
      { isTeacher: true },
      { isAdmin: true },
      { isGuardian: true },
      { isAdmin: true, isTeacher: true, isStudent: true, isGuardian: true },
    ]) {
      const items = hrefs(roles);
      expect(items[0]).toBe("/dashboard");
      expect(items[items.length - 1]).toBe("/notifications");
    }
  });

  it("gives a student their classes and nothing administrative", () => {
    expect(hrefs({ isStudent: true })).toEqual(["/dashboard", "/classes", "/notifications"]);
  });

  it("gives a teacher their classes and the course catalog", () => {
    expect(hrefs({ isTeacher: true })).toEqual([
      "/dashboard",
      "/classes",
      "/admin/courses",
      "/notifications",
    ]);
  });

  it("gives a guardian their children and no classes of their own", () => {
    expect(hrefs({ isGuardian: true })).toEqual(["/dashboard", "/children", "/notifications"]);
  });

  it("gives an admin the catalog, people and school, but no class list without an enrollment", () => {
    expect(hrefs({ isAdmin: true })).toEqual([
      "/dashboard",
      "/admin/courses",
      "/admin/people",
      "/admin/school",
      "/notifications",
    ]);
  });

  it("shows a person with several roles the union, without duplicates", () => {
    const items = hrefs({ isAdmin: true, isTeacher: true, isGuardian: true });
    expect(items).toEqual([
      "/dashboard",
      "/classes",
      "/children",
      "/admin/courses",
      "/admin/people",
      "/admin/school",
      "/notifications",
    ]);
    expect(new Set(items).size).toBe(items.length);
  });

  it("names an icon for every item", () => {
    const items = navItemsFor({ isAdmin: true, isTeacher: true, isStudent: true, isGuardian: true });
    for (const item of items) {
      expect(item.icon).toBeTruthy();
      expect(item.label).toBeTruthy();
    }
  });
});
