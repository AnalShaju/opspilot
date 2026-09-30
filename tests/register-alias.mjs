/**
 * Test bootstrap: lets Node's built-in test runner (with native TypeScript
 * type stripping) resolve the project's "@/..." import alias.
 *
 *   npm test
 */
import { register } from "node:module";

register("./alias-hooks.mjs", import.meta.url);
