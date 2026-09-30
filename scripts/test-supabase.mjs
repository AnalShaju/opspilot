/**
 * Server-side Supabase connection smoke test.
 * Loads .env.local, queries each OpsPilot table, prints column samples.
 *
 * Usage: node --env-file=.env.local scripts/test-supabase.mjs
 */
import { createClient } from "@supabase/supabase-js";

const TABLES = [
  "incidents",
  "incident_evidence",
  "incident_investigations",
  "remediation_actions",
  "incident_history",
  "resilience_tests",
  "resilience_test_results",
];

function normalizeUrl(raw) {
  return raw.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const client = createClient(normalizeUrl(url), key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log("Supabase URL:", normalizeUrl(url));
console.log("Service-role key configured:", Boolean(key));
console.log("");

let failed = 0;

for (const table of TABLES) {
  const { data, error, status } = await client.from(table).select("*").limit(1);
  if (error) {
    failed += 1;
    console.log(`✗ ${table}  HTTP ${status}: ${error.message} (${error.code ?? ""})`);
    continue;
  }
  const sample = data?.[0];
  const columns = sample ? Object.keys(sample) : "(empty table — columns unknown via select *)";
  console.log(`✓ ${table}  rows_sample=${data?.length ?? 0}  columns=${Array.isArray(columns) ? columns.join(", ") : columns}`);
}

// Probe OpenAPI for full column lists when tables are empty.
const openApiUrl = `${normalizeUrl(url)}/rest/v1/`;
const res = await fetch(openApiUrl, {
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
});

if (res.ok) {
  const spec = await res.json();
  console.log("\n── OpenAPI column definitions ──");
  for (const table of TABLES) {
    const def = spec?.definitions?.[table]?.properties;
    if (!def) {
      console.log(`? ${table}: no OpenAPI definition`);
      continue;
    }
    console.log(`${table}: ${Object.keys(def).join(", ")}`);
  }
} else {
  console.log(`\nOpenAPI probe failed: HTTP ${res.status}`);
}

if (failed > 0) {
  console.error(`\n${failed} table(s) failed. Fix connection/schema before continuing.`);
  process.exit(1);
}

console.log("\nConnection OK — all tables reachable.");
