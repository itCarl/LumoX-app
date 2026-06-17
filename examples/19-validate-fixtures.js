// 19 — Validate every fixture file in `lumox-app/fixtures/` against
// FixtureValidator (shape + semantic checks).
// Exit code 1 if any file has errors; warnings don't block.
//
//   node examples/19-validate-fixtures.js
//   node examples/19-validate-fixtures.js fixtures/Stairville
//
// Also demonstrates standalone usage:
//   const v = new FixtureValidator();
//   const result = v.validate(JSON.parse(text));

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FixtureValidator } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] ?? path.join(__dirname, '..', 'fixtures'));

console.log('Validating fixtures under:', root);
console.log('-'.repeat(60));

const validator = new FixtureValidator();
const files = await collectJsonFiles(root);
let totalErrors = 0;
let totalWarnings = 0;
let okCount = 0;

for (const file of files) {
  const text = await readFile(file, 'utf8');
  let json;
  try { json = JSON.parse(text); }
  catch (err) {
    console.log(`✗ ${rel(file)}`);
    console.log(`    JSON parse error: ${err.message}`);
    totalErrors++;
    continue;
  }

  const r = validator.validate(json);
  totalErrors   += r.errors.length;
  totalWarnings += r.warnings.length;

  if (r.valid && r.warnings.length === 0) {
    okCount++;
    console.log(`✓ ${rel(file)}`);
    continue;
  }
  console.log(`${r.valid ? '⚠' : '✗'} ${rel(file)}`);
  for (const e of r.errors)   console.log(`    ERROR   ${e.path}: ${e.message}`);
  for (const w of r.warnings) console.log(`    warn    ${w.path}: ${w.message}`);
}

console.log('-'.repeat(60));
console.log(`Checked ${files.length} file(s) — ${okCount} clean, ${totalErrors} error(s), ${totalWarnings} warning(s)`);
process.exit(totalErrors > 0 ? 1 : 0);

// ---- helpers ----
async function collectJsonFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'schema') continue;
      out.push(...await collectJsonFiles(full));
    } else if (e.isFile() && /\.(?:json|lfx)$/i.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

function rel(p) { return path.relative(process.cwd(), p); }
