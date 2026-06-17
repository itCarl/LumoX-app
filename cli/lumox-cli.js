#!/usr/bin/env node
// Lumox interactive CLI — readline REPL over the engine.
//
//   node cli/lumox-cli.js
//   npm run cli
//
// On boot:
//   - default fixture library loaded from `../fixtures`
//   - engine started @ 44 Hz, universe 0 ensured
//   - no outputs (add with `output add ...`)
//
// Type `help` to list commands. `quit` (or Ctrl+C twice) to exit.

import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  Engine, ArtNetOutput, SacnOutput,
  FixtureLibrary, Patch, Fixture, Group, GroupManager,
  rainbowGroupEffect, chaseGroupEffect, flashGroupEffect, sineIntensityGroupEffect,
  MidiManager, ApcMiniMk2,
  setLogLevel,
} from '../src/index.js';

setLogLevel('warn');  // quieter inside REPL

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libDir = path.resolve(__dirname, '..', 'fixtures');

// ---- state --------------------------------------------------------------
const engine = new Engine({ refreshHz: 44 });
engine.universes.ensure(0, 'Universe 0');

const library = new FixtureLibrary();
const patch = new Patch();
const groups = new GroupManager();
engine.groupEffects.bindPatch(patch);

const midi = new MidiManager();

// ---- boot library -------------------------------------------------------
try {
  const r = await library.loadFromDirectory(libDir);
  console.log(`Library: ${r.loaded} profiles loaded from ${libDir}`);
} catch (e) {
  console.log(`Library load failed: ${e.message}`);
}

engine.start();
console.log('Engine started @ 44 Hz. Type `help` for commands.');

// ---- readline -----------------------------------------------------------
const rl = readline.createInterface({
  input: process.stdin, output: process.stdout, prompt: 'lumox> ',
});
rl.prompt();
rl.on('line', (line) => { handle(line.trim()).catch((e) => console.log('Error:', e.message)).finally(() => rl.prompt()); });
rl.on('close', shutdown);

let interrupting = 0;
process.on('SIGINT', () => {
  if (++interrupting >= 2) shutdown();
  else { console.log('\n(Ctrl+C again to quit)'); rl.prompt(); }
});

async function shutdown() {
  console.log('\nShutting down…');
  engine.stop();
  try { await engine.outputs.closeAll(); } catch {}
  process.exit(0);
}

// ---- command dispatcher -------------------------------------------------
async function handle(line) {
  if (!line || line.startsWith('#')) return;
  const tokens = tokenize(line);
  const cmd = tokens.shift();
  const fn = commands[cmd];
  if (!fn) { console.log(`Unknown: ${cmd}. Try \`help\`.`); return; }
  await fn(tokens);
}

function tokenize(s) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2]);
  return out;
}

function num(s, min, max) {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`expected number, got "${s}"`);
  if (min != null && n < min) throw new Error(`${n} < min ${min}`);
  if (max != null && n > max) throw new Error(`${n} > max ${max}`);
  return n;
}
const int = (s, lo, hi) => Math.round(num(s, lo, hi));
const u8 = (s) => int(s, 0, 255);

// ---- commands -----------------------------------------------------------
const commands = {
  help() {
    console.log(`
Commands:
  help                          this list
  status                        engine + outputs + patch summary
  quit | exit                   leave

Engine:
  engine start | stop

Universes:
  uni add <id> [name]
  uni list
  uni ch <uniId> <ch> <0-255>   raw programmer write
  uni show <uniId> [first=1] [count=16]

Outputs:
  output add artnet <host> [broadcast=true]
  output add sacn   [unicast <host>]
  output list
  output remove <id>

Library / fixtures:
  lib list [type] [vendor]
  lib show <defId>
  lib reload
  patch add <defId> <uniId> <addr> [id]
  patch list
  patch remove <id>
  patch show <id>

Fixture control (writes through programmer, auto-flush):
  fx <id> intensity <0-255>
  fx <id> rgb  <r> <g> <b>
  fx <id> rgbw <r> <g> <b> <w>
  fx <id> set <typeId> <0-255>
  fx <id> pan  <0-65535>
  fx <id> tilt <0-65535>

Mix:
  gm <0..1>                     grand master
  blackout on | off | toggle

Groups:
  group create <id> [name]
  group list
  group add <gid> <fxId> [...]
  group rgb       <gid> <r> <g> <b>
  group intensity <gid> <0-255>

Effects (group-aware, fixture semantics):
  effect rainbow <gid> [periodMs=4000]
  effect chase   <gid> [stepMs=400]
  effect flash   <gid> [rateHz=8]
  effect sine    <gid> [periodMs=2000]
  effect list
  effect stop <effectId>

MIDI:
  midi list                                  list MIDI input + output ports
  midi connect apc [inHint] [outHint]        connect APC Mini MK2 (auto-detects port)
  midi disconnect [id]                       disconnect (default: all)
  midi controllers                           list connected controllers
`);
  },

  status() {
    const u = engine.universes.list();
    const outs = engine.outputs.list();
    console.log('Engine:  running');
    console.log('Universes:', u.map((x) => `${x.id}:${x.name}`).join(', ') || '(none)');
    console.log('Outputs:  ', outs.map((o) => `${o.id}(${o.type})→${o.name}${o.isOpen ? '*' : ''}`).join(', ') || '(none)');
    console.log('Patch:    ', patch.list().length, 'fixtures');
    console.log('Groups:   ', groups.list().length);
    console.log('GM:       ', engine.grandMaster.value.toFixed(2),
                ' Blackout:', engine.blackout.active);
  },

  quit() { shutdown(); },
  exit() { shutdown(); },

  // ---- engine ----------
  engine([sub]) {
    if (sub === 'start') engine.start();
    else if (sub === 'stop') engine.stop();
    else throw new Error('engine start|stop');
  },

  // ---- universes ----------
  uni([sub, ...rest]) {
    if (sub === 'add') {
      const id = int(rest[0], 0, 32767);
      engine.universes.ensure(id, rest[1] ?? `Universe ${id + 1}`);
      console.log('Added universe', id);
    } else if (sub === 'list') {
      for (const x of engine.universes.list()) console.log(`  ${x.id}: ${x.name}`);
    } else if (sub === 'ch') {
      const uniId = int(rest[0]), ch = int(rest[1], 1, 512), v = u8(rest[2]);
      const u = engine.universes.get(uniId);
      if (!u) throw new Error(`no universe ${uniId}`);
      u.setChannel(ch, v);
      console.log(`uni${uniId} ch${ch} = ${v}`);
    } else if (sub === 'show') {
      const uniId = int(rest[0] ?? 0);
      const first = int(rest[1] ?? 1, 1, 512);
      const count = int(rest[2] ?? 16, 1, 512 - first + 1);
      const u = engine.universes.get(uniId);
      if (!u) throw new Error(`no universe ${uniId}`);
      const row = [];
      for (let i = 0; i < count; i++) row.push(u.getChannel(first + i).toString(10).padStart(3));
      console.log(`uni${uniId} ch${first}..${first + count - 1}: ${row.join(' ')}`);
    } else throw new Error('uni add|list|ch|show');
  },

  // ---- outputs ----------
  async output([sub, ...rest]) {
    if (sub === 'add') {
      const kind = rest.shift();
      let out;
      if (kind === 'artnet') {
        const host = rest[0] ?? '255.255.255.255';
        const broadcast = (rest[1] ?? 'true') !== 'false';
        out = new ArtNetOutput({ name: `Art-Net ${host}`, host, broadcast });
      } else if (kind === 'sacn') {
        if (rest[0] === 'unicast' && rest[1]) {
          out = new SacnOutput({ name: `sACN unicast ${rest[1]}`, mode: 'unicast', host: rest[1] });
        } else {
          out = new SacnOutput({ name: 'sACN multicast', mode: 'multicast' });
        }
      } else throw new Error('output add artnet|sacn');
      engine.outputs.add(out);
      await out.open();
      console.log(`Added output ${out.id} (${out.type}) → ${out.name}`);
    } else if (sub === 'list') {
      for (const o of engine.outputs.list()) {
        console.log(`  ${o.id}  ${o.type.padEnd(7)} ${o.name}  open=${o.isOpen}  subs=${[...o.subscribedUniverses].join(',') || 'all'}`);
      }
    } else if (sub === 'remove') {
      if (!rest[0]) throw new Error('output remove <id>');
      engine.outputs.remove(rest[0]);
      console.log('Removed', rest[0]);
    } else throw new Error('output add|list|remove');
  },

  // ---- library + patch ----------
  async lib([sub, ...rest]) {
    if (sub === 'list') {
      let r = library.list();
      const arg = rest.join(' ');
      if (arg) r = library.find({ query: arg });
      for (const d of r) console.log(`  ${d.id.padEnd(45)} (${d.type}, ${d.modes.length} mode(s))`);
      console.log(`  ${r.length} profile(s)`);
    } else if (sub === 'show') {
      const def = library.get(rest.join(' '));
      if (!def) throw new Error(`no such profile`);
      console.log(`${def.id}  (${def.type})`);
      console.log(`  meta:    ${def.meta.author ?? '—'}  v${def.meta.version ?? '—'}`);
      for (const m of def.modes) {
        console.log(`  mode ${m.id} (${m.channelCount}ch):`);
        m.channels.forEach((c, i) => console.log(`    ${(i + 1).toString().padStart(3)}. ${(c?.name ?? '—').padEnd(20)} [${c?.typeId ?? '—'}]`));
      }
    } else if (sub === 'reload') {
      library.definitions.clear();
      const r = await library.loadFromDirectory(libDir);
      console.log(`Reloaded — ${r.loaded} profiles`);
    } else throw new Error('lib list|show|reload');
  },

  patch([sub, ...rest]) {
    if (sub === 'add') {
      const defId = rest[0];
      const uniId = int(rest[1]);
      const addr  = int(rest[2], 1, 512);
      const id    = rest[3];
      const def = library.get(defId);
      if (!def) throw new Error(`no profile ${defId}`);
      const fx = new Fixture({ id, definition: def, universeId: uniId, startAddress: addr });
      patch.add(fx);
      console.log(`Patched ${fx.id} (${def.id}) @ uni${uniId} ch${addr}..${fx.endAddress}`);
    } else if (sub === 'list') {
      for (const f of patch.list()) {
        console.log(`  ${f.id.padEnd(14)} ${f.definition.id.padEnd(40)} uni${f.universeId} ch${f.startAddress}..${f.endAddress}`);
      }
      console.log(`  ${patch.list().length} fixture(s)`);
    } else if (sub === 'remove') {
      patch.remove(rest[0]);
      groups.purgeFixture(rest[0]);
      console.log('Removed', rest[0]);
    } else if (sub === 'show') {
      const f = patch.get(rest[0]);
      if (!f) throw new Error('no such fixture');
      console.log(`${f.id} — ${f.definition.id} / ${f.mode.name}`);
      f.mode.channels.forEach((c, i) => console.log(`  ${(f.startAddress + i).toString().padStart(3)} ${c?.name ?? '—'} [${c?.typeId ?? '—'}] = ${f.values[i]}`));
    } else throw new Error('patch add|list|remove|show');
  },

  fx([id, op, ...rest]) {
    const f = patch.get(id);
    if (!f) throw new Error(`no fixture ${id}`);
    const u = engine.universes.get(f.universeId);
    switch (op) {
      case 'intensity': f.set('intensity', u8(rest[0])); break;
      case 'rgb':       f.setRGB(u8(rest[0]), u8(rest[1]), u8(rest[2])); break;
      case 'rgbw':      f.setRGBW(u8(rest[0]), u8(rest[1]), u8(rest[2]), u8(rest[3])); break;
      case 'set':       f.set(rest[0], u8(rest[1])); break;
      case 'pan':       f.set16('pan',  int(rest[0], 0, 65535)); break;
      case 'tilt':      f.set16('tilt', int(rest[0], 0, 65535)); break;
      default: throw new Error('fx <id> intensity|rgb|rgbw|set|pan|tilt');
    }
    if (u) f.apply(u);
    console.log(`fx ${id} ${op} → channels ${f.startAddress}..${f.endAddress} updated`);
  },

  // ---- mix ----------
  gm([v]) {
    const n = num(v, 0, 1);
    engine.grandMaster.setValue(n);
    console.log(`GM = ${n}`);
  },

  blackout([sub]) {
    if (sub === 'on')         engine.blackout.set(true);
    else if (sub === 'off')   engine.blackout.set(false);
    else if (sub === 'toggle') engine.blackout.toggle();
    else throw new Error('blackout on|off|toggle');
    console.log('Blackout:', engine.blackout.active);
  },

  // ---- groups ----------
  group([sub, ...rest]) {
    if (sub === 'create') {
      const id = rest[0];
      if (!id) throw new Error('group create <id> [name]');
      const g = groups.add(new Group({ id, name: rest.slice(1).join(' ') || id }));
      console.log('Created group', g.id);
    } else if (sub === 'list') {
      for (const g of groups.list()) console.log(`  ${g.id.padEnd(14)} "${g.name}"  ${g.size} fixture(s): [${g.list().join(', ')}]`);
    } else if (sub === 'add') {
      const g = groups.get(rest.shift());
      if (!g) throw new Error('no such group');
      for (const id of rest) g.add(id);
      console.log(`${g.id}: ${g.size} fixture(s)`);
    } else if (sub === 'rgb') {
      const g = groups.get(rest[0]);
      if (!g) throw new Error('no such group');
      g.setRGB(patch, u8(rest[1]), u8(rest[2]), u8(rest[3]));
      g.apply(patch, engine.universes);
      console.log(`group ${g.id} → RGB`);
    } else if (sub === 'intensity') {
      const g = groups.get(rest[0]);
      if (!g) throw new Error('no such group');
      g.setIntensity(patch, u8(rest[1]));
      g.apply(patch, engine.universes);
      console.log(`group ${g.id} → intensity`);
    } else throw new Error('group create|list|add|rgb|intensity');
  },

  // ---- midi ----------
  async midi([sub, ...rest]) {
    if (sub === 'list') {
      const inputs = await midi.listInputs();
      const outputs = await midi.listOutputs();
      console.log('Inputs:');
      inputs.forEach((n, i) => console.log(`  ${i}. ${n}`));
      console.log('Outputs:');
      outputs.forEach((n, i) => console.log(`  ${i}. ${n}`));
      if (inputs.length === 0 && outputs.length === 0) {
        console.log('(no MIDI ports — easymidi may not be installed: `npm install easymidi`)');
      }
    } else if (sub === 'connect') {
      const kind = rest[0] ?? 'apc';
      if (kind !== 'apc') throw new Error('only `apc` (APC Mini MK2) is built-in. extend MidiController for others.');
      const inHint  = rest[1] ?? ApcMiniMk2.DEFAULT_PORT_HINT;
      const outHint = rest[2] ?? ApcMiniMk2.DEFAULT_PORT_HINT;
      const inName  = await midi.findPort('in',  inHint);
      const outName = await midi.findPort('out', outHint);
      if (!inName)  throw new Error(`no MIDI input matching "${inHint}"`);
      if (!outName) console.log(`Warning: no MIDI output matching "${outHint}" — LED feedback disabled`);
      const input  = await midi.openInput(inName);
      const output = outName ? await midi.openOutput(outName) : null;
      const ctl = new ApcMiniMk2({ engine, patch, groups, id: 'apc' });
      await ctl.connect(input, output);
      midi.attach(ctl);
      console.log(`Connected ${ctl.name} — input "${inName}"${outName ? `, output "${outName}"` : ''}`);
    } else if (sub === 'disconnect') {
      if (rest[0]) await midi.detach(rest[0]);
      else for (const c of midi.list()) await midi.detach(c);
      console.log('Disconnected');
    } else if (sub === 'controllers') {
      for (const c of midi.list()) {
        console.log(`  ${c.id}  ${c.name}  input=${c.input?.name ?? '—'}  output=${c.output?.name ?? '—'}`);
      }
    } else throw new Error('midi list|connect|disconnect|controllers');
  },

  // ---- effects ----------
  effect([sub, ...rest]) {
    if (sub === 'list') {
      for (const fx of engine.groupEffects.list()) {
        console.log(`  ${fx.id.padEnd(14)} ${fx.name.padEnd(18)} group=${fx.group.id}  opacity=${fx.opacity}  enabled=${fx.enabled}`);
      }
      return;
    }
    if (sub === 'stop') {
      engine.groupEffects.remove(rest[0]);
      console.log('Stopped', rest[0]);
      return;
    }
    const gid = rest[0];
    const g = groups.get(gid);
    if (!g) throw new Error(`no group ${gid}`);
    const id = `${sub}-${g.id}-${Date.now().toString(36)}`;
    let fx;
    switch (sub) {
      case 'rainbow': fx = rainbowGroupEffect({ id, group: g, periodMs: int(rest[1] ?? 4000) }); break;
      case 'chase':   fx = chaseGroupEffect({   id, group: g, stepMs:   int(rest[1] ?? 400)  }); break;
      case 'flash':   fx = flashGroupEffect({   id, group: g, rateHz:   num(rest[1] ?? 8)    }); break;
      case 'sine':    fx = sineIntensityGroupEffect({ id, group: g, periodMs: int(rest[1] ?? 2000) }); break;
      default: throw new Error('effect rainbow|chase|flash|sine|list|stop');
    }
    engine.groupEffects.add(fx);
    console.log(`Started effect ${id} on group ${g.id}`);
  },
};
