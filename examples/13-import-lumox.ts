// 13 — Lumox JSON: parse via ImporterRegistry, inspect, re-serialize.
//
//   node examples/13-import-lumox.js

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ImporterRegistry } from '../src/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, 'data', 'demo-mover.lumox.json');

const importer = ImporterRegistry.forExtension('.json')!;     // → LumoxImporter
console.log('Using importer:', (importer.constructor as any).FORMAT);

const defs = importer.parse(readFileSync(file));
const def = defs[0];

console.log('Loaded:', def.id, `(${def.type})`);
for (const mode of def.modes) {
  console.log(`  mode "${mode.name}" — ${mode.channelCount} channels`);
  mode.channels.forEach((c: any, i) => {
    console.log(`    ${i + 1}. ${c.name.padEnd(10)} [${c.typeId}]  caps=${c.capabilities.length}`);
  });
}

// Round-trip — write back to a temp file and re-parse.
const outFile = path.join(__dirname, 'data', '_roundtrip.lumox.json');
writeFileSync(outFile, importer.serialize(defs));
const reread = importer.parse(readFileSync(outFile));
console.log('Round-trip ok:', reread[0].id === def.id);
