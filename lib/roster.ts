/**
 * Emails pasted into a roster box: one per line, or separated by commas or
 * semicolons. Lower-cased and de-duplicated so a list typed with mixed case
 * matches the accounts it names exactly once; anything without an "@" is
 * dropped as not an address at all.
 */
export function parseEmailList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\r\n,;]+/)
        .map((line) => line.trim().toLowerCase())
        .filter((entry) => entry.includes("@")),
    ),
  ];
}
