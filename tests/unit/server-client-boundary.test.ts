import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static checks for the React Server Components boundary. `next build` does
 * not catch these: they only fail at request time, which is how the dashboard
 * once crashed for every signed-in user. Each rule below is one of those
 * failure modes.
 *
 * 1. A server module may import only components (PascalCase) and types from
 *    a "use client" module. A function or constant imported across that
 *    boundary becomes a client reference on the server and throws when used.
 * 2. A "use client" module must not import server-only code: request
 *    cookies, the server Supabase client, or the data layer built on them.
 * 3. A "use server" module may export only async functions (and types).
 *    Any other value export makes the whole file fail to load as actions.
 */

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE_DIRS = ["app", "components", "lib"];
const SOURCE_FILES = ["middleware.ts"];
const EXTENSIONS = [".ts", ".tsx"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

/** Modules that must never reach the browser bundle. */
const SERVER_ONLY_SPECIFIERS = [
  "next/headers",
  "server-only",
  "@/lib/supabase/server",
  "@/lib/data",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.includes(path.extname(full))) out.push(full);
  }
  return out;
}

function sourceFiles(): string[] {
  const files = SOURCE_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));
  for (const file of SOURCE_FILES) files.push(path.join(ROOT, file));
  return files.filter((f) => !f.endsWith(".d.ts"));
}

/** The module directive, if the file opens with one (comments allowed before it). */
function directiveOf(source: string): "client" | "server" | null {
  const head = source.replace(/^(\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*/, "").trimStart();
  if (/^(["'])use client\1/.test(head)) return "client";
  if (/^(["'])use server\1/.test(head)) return "server";
  return null;
}

interface Import {
  specifier: string;
  /** Exported names imported as values (type-only imports excluded). */
  values: string[];
  /** Local name of a default import, when there is one. */
  defaultName: string | null;
}

const IMPORT_RE =
  /import\s+(type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+[\w$]+)?\s*from\s*["']([^"']+)["']/g;

function importsOf(source: string): Import[] {
  const imports: Import[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const [, typeOnly, defaultName, named, specifier] = match;
    if (typeOnly) continue;
    const values = (named ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("type "))
      .map((s) => s.split(/\s+as\s+/)[0].trim());
    imports.push({ specifier, values, defaultName: defaultName ?? null });
  }
  return imports;
}

/** Resolve an import to a file on disk, or null for a package import. */
function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return null;

  const candidates = [
    ...EXTENSIONS.map((ext) => base + ext),
    ...EXTENSIONS.map((ext) => path.join(base, "index" + ext)),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // try the next one
    }
  }
  return null;
}

const isComponentName = (name: string) => /^[A-Z][A-Za-z0-9]*$/.test(name) && /[a-z]/.test(name);

const rel = (file: string) => path.relative(ROOT, file);

describe("server/client boundary", () => {
  const files = sourceFiles();
  const sources = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
  const directives = new Map(files.map((f) => [f, directiveOf(sources.get(f)!)]));

  it("finds the modules it is meant to check", () => {
    expect(files.length).toBeGreaterThan(20);
    expect([...directives.values()].filter((d) => d === "client").length).toBeGreaterThan(0);
    expect([...directives.values()].filter((d) => d === "server").length).toBeGreaterThan(0);
  });

  it("imports only components and types from client modules into server modules", () => {
    const violations: string[] = [];
    for (const file of files) {
      if (directives.get(file) === "client") continue;
      for (const imp of importsOf(sources.get(file)!)) {
        const target = resolveImport(file, imp.specifier);
        if (!target || directives.get(target) !== "client") continue;
        const bad = imp.values.filter((name) => !isComponentName(name));
        if (imp.defaultName && !isComponentName(imp.defaultName)) bad.push(imp.defaultName);
        if (bad.length > 0) {
          violations.push(
            `${rel(file)} imports { ${bad.join(", ")} } from client module ${rel(target)}; ` +
              "move it to a module without \"use client\"",
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps server-only modules out of client modules", () => {
    const violations: string[] = [];
    for (const file of files) {
      if (directives.get(file) !== "client") continue;
      for (const imp of importsOf(sources.get(file)!)) {
        const target = resolveImport(file, imp.specifier);
        const specifier = target ? "@/" + rel(target).replace(/\.tsx?$/, "") : imp.specifier;
        if (SERVER_ONLY_SPECIFIERS.includes(specifier)) {
          violations.push(`${rel(file)} imports server-only module ${imp.specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("exports only async functions and types from server action modules", () => {
    const violations: string[] = [];
    for (const file of files) {
      if (directives.get(file) !== "server") continue;
      for (const match of sources.get(file)!.matchAll(/^export\s+[^\n]*/gm)) {
        const line = match[0];
        const allowed =
          /^export\s+(?:type|interface)\b/.test(line) || /^export\s+async\s+function\b/.test(line);
        if (!allowed) violations.push(`${rel(file)}: ${line.trim()}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
