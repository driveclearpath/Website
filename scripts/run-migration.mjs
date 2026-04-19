// One-off migration runner via Supabase Management API.
// Usage: node --env-file=.env scripts/run-migration.mjs <path-to-sql>
//
// Env required:
//   SUPABASE_ACCESS_TOKEN  (sbp_...)  — Supabase personal/management token
//   SUPABASE_PROJECT_REF   (e.g. gsqvcnzamnstkrnprlts)

import { readFileSync } from 'fs';
import { resolve } from 'path';

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error('Usage: node scripts/run-migration.mjs <sql-file>');
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF in env.');
  process.exit(1);
}

const sql = readFileSync(resolve(sqlPath), 'utf8');
console.log(`Running: ${sqlPath} (${sql.length} chars) against project ${ref}`);

const resp = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const text = await resp.text();
if (!resp.ok) {
  console.error(`\u2717 HTTP ${resp.status}`);
  console.error(text);
  process.exit(1);
}

console.log('\u2713 SQL executed cleanly.');
try {
  const json = JSON.parse(text);
  if (Array.isArray(json) && json.length) {
    console.log('Rows returned:', json.length);
  }
} catch {
  // non-JSON response is fine for DDL
}
