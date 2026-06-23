// `npm run gen-gobo` (or `tsx tools/gen-gobo-patterns.ts [--dry|--check]`) —
// author `pattern` icons on the bundled Moving-Head fixture profiles' gobo-wheel
// slots, so each gobo shows a real shape at the GOBO faders instead of plain text.
//
// For every `kind:"gobo"` capability on a `gobo-wheel*` channel of a `Moving Head`
// definition, the label is classified to a motif (see gobo-shapes.ts) and the
// encoded `g32:` pattern (identical to what the Draw-gobo editor produces) is
// inserted into the JSON. Dynamic ranges (rotation/rainbow/scroll/shake/stop) and
// the open slot get no icon — they stay text chips.
//
// Insertion is format-preserving (a field is spliced right after the object's
// opening brace, matching the existing compact-or-expanded style); an existing
// `pattern` is overwritten in place. The tool is therefore authoritative — re-running
// converges to the current motifs/format and only the changed lines move.
//
//   --dry    report what would change (+ motif histogram + unclassified labels), write nothing
//   --check  verify every target slot already carries the expected pattern (CI-style)

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyGobo, motifPattern, motifAscii, MOTIF_KEYS } from './gobo-shapes';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX_ROOT = path.join(__dirname, '..', 'fixtures');
const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--dry') ? 'dry' : 'apply';

// Eyeball motifs without scanning: `tsx tools/gen-gobo-patterns.ts --ascii circle star flower`
if (process.argv.includes('--ascii')) {
  const want = process.argv.slice(process.argv.indexOf('--ascii') + 1).filter((k) => MOTIF_KEYS.includes(k));
  for (const k of (want.length ? want : MOTIF_KEYS)) { console.log(`\n# ${k} (${motifPattern(k).length} chars)`); console.log(motifAscii(k)); }
  process.exit(0);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith('.lumox.json')) out.push(p);
  }
  return out;
}

interface Slot { label: string; key: string | null; pattern: string | null; }

// One entry per `kind:"gobo"` capability in document order (so it lines up with
// the regex matches over the raw text). `pattern` is set only for static Moving-Head
// gobo-wheel slots that classify to a motif.
function slots(doc: any): Slot[] {
  const out: Slot[] = [];
  for (const d of doc.definitions ?? [])
    for (const m of d.modes ?? [])
      for (const ch of m.channels ?? [])
        for (const cap of ch.capabilities ?? []) {
          if (cap.kind !== 'gobo') continue;
          // Any gobo-group channel of a Moving Head (some fixtures hang static
          // slots off the shake/rotation channel, not just the wheel); the
          // classifier drops the rotation/shake/open ranges to null anyway.
          const target = d.type === 'Moving Head' && String(ch.typeId ?? '').startsWith('gobo');
          const key = target ? classifyGobo(String(cap.label ?? '')) : null;
          out.push({ label: String(cap.label ?? ''), key, pattern: key ? motifPattern(key) : null });
        }
  return out;
}

// Splice patterns into the raw JSON text, preserving each object's formatting.
const GOBO_OBJ = /\{[^{}]*"kind":\s*"gobo"[^{}]*\}/g;
function applyPatterns(raw: string, q: Slot[]): { out: string; changed: number; matched: number } {
  let i = 0, changed = 0;
  const out = raw.replace(GOBO_OBJ, (match) => {
    const slot = q[i++];
    if (!slot || !slot.pattern) return match;
    const field = `"pattern": ${JSON.stringify(slot.pattern)}`;
    if (/"pattern"\s*:/.test(match)) {                      // overwrite an existing value in place
      const next = match.replace(/"pattern"\s*:\s*"[^"]*"/, field);
      if (next !== match) changed++;
      return next;
    }
    changed++;                                              // insert, matching the object's style
    if (match.includes('\n')) {
      const m = match.match(/^\{[ \t]*\r?\n([ \t]+)/);
      const indent = m ? m[1] : '          ';
      return match.replace(/^\{[ \t]*\r?\n/, (lead) => `${lead}${indent}${field},\n`);
    }
    return match.replace(/^\{[ \t]*/, `{ ${field}, `);
  });
  return { out, changed, matched: i };
}

// ---- run -------------------------------------------------------------------
const files = walk(FIX_ROOT);
const hist = new Map<string, number>();
const unclassified = new Map<string, string>();   // label → first file (looks static but no motif)
const OPEN_RE = /\bopen\b|no gobo|^white$|open ?\/ ?white|\(open\)/;
const EFFECT_RE = /shak|rotat|spin|rainbow|scroll|\bstop\b|run.?through|sound|no function|\boff\b|\bcw\b|\bccw\b|clockwise|counter|forwards|backwards|reverse|slow|fast|increasing|decreasing|wheel|selection|speed|→|->/;

let changed = 0, totalCaps = 0, totalPatterned = 0, mismatches = 0;

for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  let doc: any;
  try { doc = JSON.parse(raw); } catch { console.error('PARSE FAIL', f); process.exitCode = 1; continue; }
  const q = slots(doc);
  if (!q.length) continue;

  for (const s of q) {
    totalCaps++;
    if (s.pattern) { totalPatterned++; hist.set(s.key!, (hist.get(s.key!) ?? 0) + 1); }
    else {
      // Flag labels that look like a static slot we failed to draw (not open/effect).
      const tl = s.label.trim().toLowerCase();
      // only flag rows that belong to a real MH gobo-wheel (key path), i.e. were considered
      if (tl && !OPEN_RE.test(tl) && !EFFECT_RE.test(tl) && s.key === null) {
        // Was this a Moving-Head gobo-wheel slot at all? slots() already restricted
        // pattern computation to those; reuse classify to avoid re-flagging effects.
        if (classifyGobo(s.label) === null && /gobo|^g\d|metal/.test(tl)) unclassified.set(tl, path.relative(FIX_ROOT, f));
      }
    }
  }

  if (mode === 'check') {
    // Re-derive expected from labels and confirm the file already carries them.
    let idx = 0;
    for (const d of doc.definitions ?? [])
      for (const m of d.modes ?? [])
        for (const ch of m.channels ?? [])
          for (const cap of ch.capabilities ?? []) {
            if (cap.kind !== 'gobo') continue;
            const want = q[idx++].pattern;
            if (want && cap.pattern !== want) { mismatches++; console.error('MISSING/MISMATCH', path.relative(FIX_ROOT, f), JSON.stringify(cap.label)); }
          }
    continue;
  }

  const { out, changed: nch, matched } = applyPatterns(raw, q);
  if (matched !== q.length) { console.error('ALIGN FAIL', f, `regex matched ${matched} gobo objects, walk found ${q.length}`); process.exitCode = 1; continue; }
  if (!nch || out === raw) continue;
  try { JSON.parse(out); } catch (e) { console.error('PRODUCED INVALID JSON', f, e); process.exitCode = 1; continue; }
  if (mode === 'apply') writeFileSync(f, out);
  changed++;
  console.log(`${mode === 'dry' ? '[dry] ' : ''}${path.relative(FIX_ROOT, f)} — ${nch} gobo icons`);
}

console.log('\n=== motif histogram ===');
for (const [k, v] of [...hist.entries()].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k);
const missing = MOTIF_KEYS.filter((k) => !hist.has(k));
if (missing.length) console.log('motifs never used:', missing.join(', '));

if (unclassified.size) {
  console.log('\n=== gobo-ish labels left as text (review) ===');
  for (const [l, f] of unclassified) console.log('  ', JSON.stringify(l), '←', f);
}

console.log(`\nfiles ${mode === 'apply' ? 'changed' : 'affected'}: ${changed} · gobo caps on MH wheels: ${totalCaps} · iconified: ${totalPatterned}`);
if (mode === 'check') { console.log(`check mismatches: ${mismatches}`); if (mismatches) process.exitCode = 1; }
