import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The middleware is the only thing between an anonymous request and a page
 * that assumes a user; the server components behind it redirect too, but a
 * regression here would mean an extra round trip and, for data loaders, an
 * unhandled call. Supabase is mocked: what is under test is the routing.
 */

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

const getUser = vi.fn();
let capturedCookies: {
  getAll(): unknown;
  setAll(cookies: CookieToSet[]): void;
} | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url: string, _key: string, options: { cookies: typeof capturedCookies }) => {
    capturedCookies = options.cookies;
    return { auth: { getUser } };
  }),
}));

const { updateSession } = await import("@/lib/supabase/middleware");

const request = (pathname: string) => new NextRequest(`http://localhost${pathname}`);

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  getUser.mockReset();
  capturedCookies = null;
});

describe("updateSession", () => {
  it("sends an anonymous visitor to login and remembers where they were going", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await updateSession(request("/classes/abc"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/classes/abc");
  });

  it("protects every app route, including the dashboard and admin pages", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    for (const pathname of ["/dashboard", "/admin/people", "/onboarding", "/notifications"]) {
      const response = await updateSession(request(pathname));
      expect(response.status, pathname).toBe(307);
    }
  });

  it("lets an anonymous visitor reach the public pages", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    for (const pathname of ["/", "/login", "/signup", "/auth/callback"]) {
      const response = await updateSession(request(pathname));
      expect(response.status, pathname).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("lets a signed-in user through to app routes", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const response = await updateSession(request("/dashboard"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("reads the session from the request cookies", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const req = request("/dashboard");
    req.cookies.set("sb-token", "abc");
    await updateSession(req);
    const names = (capturedCookies!.getAll() as { name: string }[]).map((c) => c.name);
    expect(names).toContain("sb-token");
  });

  it("forwards a refreshed session cookie to the browser", async () => {
    // Supabase refreshes the token inside getUser() and hands back cookies
    // through setAll; they must land on the response, or the user is signed
    // out again on the next request.
    getUser.mockImplementation(async () => {
      capturedCookies!.setAll([
        { name: "sb-token", value: "refreshed", options: { path: "/", httpOnly: true } },
      ]);
      return { data: { user: { id: "u1" } } };
    });
    const response = await updateSession(request("/dashboard"));
    expect(response.cookies.get("sb-token")?.value).toBe("refreshed");
  });
});
