// 23 — APC Mini MK2 wired to the engine.
//
// Works in two modes:
//   - If `easymidi` is installed AND an APC Mini MK2 is plugged in, the
//     real device drives the engine (try faders, scene buttons, etc.).
//   - Otherwise the mock backend is used: scripted MIDI events injected
//     into the controller demonstrate every binding without hardware.
//
//   node examples/23-midi-apc-mini.js
//   node examples/23-midi-apc-mini.js --mock        force mock backend
//
// Bindings (see src/midi/controllers/ApcMiniMk2.js):
//   Master fader (CC 56)   → GrandMaster
//   Faders CC 48..55       → groups 1..8 intensity
//   Scene 112 (top-right)  → blackout toggle
//   Scene 113              → all groups full
//   Scene 114              → all groups half
//   Scene 115              → all groups off
//   Scene 116              → GM = 1.0
//   Track 100..107         → flash group 1..8 to 100% while held
//   Pads 0..63             → user-bindable (see below)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Engine, Patch, Fixture, Group, GroupManager,
  FixtureLibrary,
  MidiManager, ApcMiniMk2, MockMidiBackend,
} from '../src/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const forceMock = process.argv.includes('--mock');

// ---- engine + scene -----------------------------------------------------
const engine = new Engine({ refreshHz: 44 });
engine.universes.ensure(0, 'Stage');

const library = new FixtureLibrary();
await library.loadFromDirectory(path.resolve(__dirname, '..', 'fixtures'));
const parProfile = library.get('Generic/PAR RGBW 4ch');

const patch = new Patch();
for (let i = 0; i < 6; i++) {
  patch.add(new Fixture({
    id: `par${i + 1}`, definition: parProfile!,
    universeId: 0, startAddress: 1 + i * 4,
  }));
}

const groups = new GroupManager();
const left  = groups.add(new Group({ id: '01-left',  name: 'Left'  }));
const right = groups.add(new Group({ id: '02-right', name: 'Right' }));
['par1', 'par2', 'par3'].forEach((id) => left.add(id));
['par4', 'par5', 'par6'].forEach((id) => right.add(id));

// Init colors so faders show visible effect
left.setRGB(patch, 255, 60, 0);
right.setRGB(patch, 0, 80, 255);
left.setIntensity(patch, 255);
right.setIntensity(patch, 255);
patch.applyAll(engine.universes);

engine.groupEffects!.bindPatch(patch);
engine.start();

// ---- MIDI ---------------------------------------------------------------
const midi = new MidiManager({ backend: forceMock ? new MockMidiBackend() : null });
const inputs = await midi.listInputs();
console.log('MIDI inputs:', inputs.length ? inputs : '(none)');

let input: any, output: any;
const isMock = forceMock || (await midi.ensureBackend()) instanceof MockMidiBackend;

if (isMock) {
  console.log('Running with MOCK backend — scripting MIDI events.');
  input  = await midi.openInput('apc-mini-mk2-mock-in');
  output = await midi.openOutput('apc-mini-mk2-mock-out');
} else {
  const inName  = await midi.findPort('in',  ApcMiniMk2.DEFAULT_PORT_HINT);
  const outName = await midi.findPort('out', ApcMiniMk2.DEFAULT_PORT_HINT);
  if (!inName) {
    console.log('APC Mini MK2 not detected — run with --mock to test without hardware.');
    process.exit(0);
  }
  input  = await midi.openInput(inName);
  output = outName ? await midi.openOutput(outName) : null;
  console.log(`Hardware: input "${inName}"${outName ? `, output "${outName}"` : ''}`);
}

const apc = new ApcMiniMk2({ engine, patch, groups });
await apc.connect(input, output);
midi.attach(apc);

// Bind a few pads for demo: top row toggles per-group colors
apc.bindPad(0,  { color: ApcMiniMk2.COLOR.red,    press: () => { left.setRGB(patch,  255,   0,   0); patch.applyAll(engine.universes); }});
apc.bindPad(1,  { color: ApcMiniMk2.COLOR.green,  press: () => { left.setRGB(patch,    0, 255,   0); patch.applyAll(engine.universes); }});
apc.bindPad(2,  { color: ApcMiniMk2.COLOR.blue,   press: () => { left.setRGB(patch,    0,   0, 255); patch.applyAll(engine.universes); }});
apc.bindPad(3,  { color: ApcMiniMk2.COLOR.white,  press: () => { left.setRGB(patch,  255, 255, 255); patch.applyAll(engine.universes); }});
apc.bindPad(8,  { color: ApcMiniMk2.COLOR.red,    press: () => { right.setRGB(patch, 255,   0,   0); patch.applyAll(engine.universes); }});
apc.bindPad(9,  { color: ApcMiniMk2.COLOR.green,  press: () => { right.setRGB(patch,   0, 255,   0); patch.applyAll(engine.universes); }});
apc.bindPad(10, { color: ApcMiniMk2.COLOR.blue,   press: () => { right.setRGB(patch,   0,   0, 255); patch.applyAll(engine.universes); }});
apc.bindPad(11, { color: ApcMiniMk2.COLOR.white,  press: () => { right.setRGB(patch, 255, 255, 255); patch.applyAll(engine.universes); }});

if (isMock) {
  // Script a sequence so the example does something visible.
  const u = engine.universes.get(0)!;
  const dump = (label: string) => console.log(`${label.padEnd(22)} ch1..24 = ${[...u.data.slice(0, 24)].join(' ')}`);

  await sleep(150); dump('start');

  console.log('\n→ pad 0 (left = red)');
  input.inject('noteon',  { note: 0,  velocity: 127, channel: 0 });
  input.inject('noteoff', { note: 0,  channel: 0 });
  await sleep(50); dump('after pad 0');

  console.log('\n→ pad 10 (right = blue)');
  input.inject('noteon',  { note: 10, velocity: 127, channel: 0 });
  input.inject('noteoff', { note: 10, channel: 0 });
  await sleep(50); dump('after pad 10');

  console.log('\n→ fader CC 48 (group "01-left" intensity = 64)');
  input.inject('cc', { controller: 48, value: 64, channel: 0 });
  await sleep(50); dump('after fader 48');

  console.log('\n→ Master fader CC 56 = 64 (GM = 0.5)');
  input.inject('cc', { controller: 56, value: 64, channel: 0 });
  await sleep(50); dump('after master fader');

  console.log('\n→ scene button 112 (blackout)');
  input.inject('noteon',  { note: 112, velocity: 127, channel: 0 });
  input.inject('noteoff', { note: 112, channel: 0 });
  await sleep(50); dump('after blackout');

  console.log('\n→ scene button 112 (blackout off)');
  input.inject('noteon',  { note: 112, velocity: 127, channel: 0 });
  input.inject('noteoff', { note: 112, channel: 0 });
  await sleep(50); dump('after blackout off');

  console.log('\nLED messages sent to mock output:', output.sent.length);
  const recent = output.sent.slice(-6);
  recent.forEach((m: unknown) => console.log('  ', m));

  console.log('\nDone. (Real hardware: omit --mock, plug in APC Mini MK2.)');
  await apc.disconnect();
  engine.stop();
  process.exit(0);
}

// Hardware path — run until Ctrl+C
console.log('\nAPC Mini MK2 connected. Pads 0-3 = left RGB, pads 8-11 = right RGB.');
console.log('Faders 1-2 = group intensity, master = GM. Scene buttons = utilities.');
console.log('Ctrl+C to exit.');

process.on('SIGINT', async () => {
  await apc.disconnect();
  engine.stop();
  process.exit(0);
});

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
