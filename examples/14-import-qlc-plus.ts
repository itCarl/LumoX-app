// 14 — QLC+ 5 .qxf import. Convert XML profile → Lumox FixtureDefinition.
//
//   node examples/14-import-qlc-plus.js

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ImporterRegistry, FixtureLibrary } from '../src/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, 'data', 'demo-par.qxf');

const importer = ImporterRegistry.forExtension('.qxf')!;     // → QlcPlusImporter
console.log('Using importer:', (importer.constructor as any).FORMAT);

const defs = importer.parse(readFileSync(file));
const def = defs[0];

console.log('Imported:', def.id, `(${def.type})`);
console.log('Modes:', def.modes.map((m) => m.name));

const mode = def.defaultMode!;
console.log(`Channels in "${mode.name}":`);
mode.channels.forEach((c: any, i) => {
  const caps = c.capabilities.map((p: any) => `[${p.min}-${p.max}] ${p.label}`).join('  ');
  console.log(`  ${i + 1}. ${c.name.padEnd(10)} [${c.typeId}]  ${caps}`);
});

// Drop into a library
const lib = new FixtureLibrary();
lib.add(def, 'imported');
console.log('Library after import:', lib.list().map((d) => d.id));
