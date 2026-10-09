import { beforeEach, describe, expect, it, vi } from "vitest";
import { formData } from "../helpers/supabase-mock";

/**
 * Sign-in and sign-up: credential validation and, above all, that the
 * post-login redirect cannot be pointed off-site by a crafted "next".
 */

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

const { signIn, signOut, signUp } = await import("@/lib/actions/auth");

const prev = { error: null };

beforeEach(() => {
  auth.signInWithPassword.mockReset().mockResolvedValue({ error: null });
  auth.signUp.mockReset().mockResolvedValue({ error: null });
  auth.signOut.mockReset().mockResolvedValue({ error: null });
});

describe("signIn", () => {
  it("signs in and continues to the requested page", async () => {
    await expect(
      signIn(prev, formData({ email: "a@b.test", password: "longenough", next: "/classes/1" })),
    ).rejects.toThrow("REDIRECT /classes/1");
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.test", password: "longenough" });
  });

  it("never redirects off-site, whatever next says", async () => {
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", "dashboard"]) {
      await expect(signIn(prev, formData({ email: "a@b.test", password: "longenough", next }))).rejects.toThrow(
        "REDIRECT /dashboard",
      );
    }
  });

  it("validates before touching Supabase", async () => {
    expect((await signIn(prev, formData({ email: "nope", password: "longenough" }))).error).toMatch(/email/i);
    expect((await signIn(prev, formData({ email: "a@b.test", password: "short" }))).error).toMatch(/8 characters/);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("shows the provider's error", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const result = await signIn(prev, formData({ email: "a@b.test", password: "longenough" }));
    expect(result).toEqual({ error: "Invalid login credentials" });
  });
});

describe("signUp", () => {
  it("creates the account with the name in metadata and goes to onboarding", async () => {
    await expect(
      signUp(prev, formData({ email: "a@b.test", password: "longenough", fullName: "Ada Lovelace" })),
    ).rejects.toThrow("REDIRECT /onboarding");
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "a@b.test",
      password: "longenough",
      options: { data: { full_name: "Ada Lovelace" } },
    });
  });

  it("requires a name", async () => {
    const result = await signUp(prev, formData({ email: "a@b.test", password: "longenough", fullName: "" }));
    expect(result.error).toMatch(/name/i);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("honours a safe next and falls back to onboarding for an unsafe one", async () => {
    const fields = { email: "a@b.test", password: "longenough", fullName: "Ada" };
    await expect(signUp(prev, formData({ ...fields, next: "/join/abc" }))).rejects.toThrow("REDIRECT /join/abc");
    await expect(signUp(prev, formData({ ...fields, next: "https://evil.example" }))).rejects.toThrow(
      "REDIRECT /onboarding",
    );
  });
});

describe("signOut", () => {
  it("ends the session and returns to login", async () => {
    await expect(signOut()).rejects.toThrow("REDIRECT /login");
    expect(auth.signOut).toHaveBeenCalled();
  });
});
