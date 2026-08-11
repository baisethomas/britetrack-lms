import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeRedirectPath("/courses")).toBe("/courses");
    expect(safeRedirectPath("/courses/abc/lessons/def")).toBe(
      "/courses/abc/lessons/def",
    );
    expect(safeRedirectPath("/dashboard?tab=progress")).toBe(
      "/dashboard?tab=progress",
    );
  });

  it("rejects absolute URLs", () => {
    expect(safeRedirectPath("https://attacker.example")).toBe("/dashboard");
    expect(safeRedirectPath("http://attacker.example/path")).toBe("/dashboard");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeRedirectPath("//attacker.example")).toBe("/dashboard");
    expect(safeRedirectPath("//attacker.example/courses")).toBe("/dashboard");
  });

  it("rejects backslash network-path references", () => {
    // Browsers normalize these to "//attacker.example".
    expect(safeRedirectPath("/\\attacker.example")).toBe("/dashboard");
    expect(safeRedirectPath("/\\/attacker.example")).toBe("/dashboard");
    expect(safeRedirectPath("\\\\attacker.example")).toBe("/dashboard");
  });

  it("rejects relative paths that do not start with a slash", () => {
    expect(safeRedirectPath("courses")).toBe("/dashboard");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/dashboard");
  });

  it("rejects non-string input", () => {
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(42)).toBe("/dashboard");
    expect(safeRedirectPath(["/courses"])).toBe("/dashboard");
  });

  it("honours a custom fallback", () => {
    expect(safeRedirectPath("https://attacker.example", "/login")).toBe("/login");
  });
});
