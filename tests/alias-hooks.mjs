import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const ALIASES = [
  ["@/", path.resolve(ROOT, "src")],
  ["@tests/", path.resolve(ROOT, "tests")],
];

export async function resolve(specifier, context, nextResolve) {
  for (const [prefix, dir] of ALIASES) {
    if (!specifier.startsWith(prefix)) continue;
    const base = path.join(dir, specifier.slice(prefix.length));
    const candidates = [
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, "index.ts"),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
