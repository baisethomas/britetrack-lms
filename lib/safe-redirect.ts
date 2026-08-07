/**
 * Constrain a client-supplied redirect target to a same-origin path.
 * Rejects absolute URLs, protocol-relative "//host", and backslash variants
 * ("/\host"), which browsers normalize to cross-origin destinations.
 */
export function safeRedirectPath(
  value: unknown,
  fallback = "/dashboard",
): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
    ? value
    : fallback;
}
