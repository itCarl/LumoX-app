// 24 — Create, store, recall, and crossfade scenes.
//
// Workflow:
//   1. Patch 4 PARs into a group
//   2. Write a "look" via fixture API → snapshot into a Scene
//   3. Repeat for two more looks
//   4. Add all scenes to engine.scenes (SceneMixer) at opacity 0
//   5. Trigger scenes one at a time with a linear opacity fade
//
//   node examples/24-scenes.js
//
// LTP blend used here so each scene cleanly takes over. Switch to
// 'htp' if you want highest-takes-precedence intensity behaviour.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Engine, Patch, Fixture, Group, GroupManager, Scene,
  FixtureLibrary,
} from '../src/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- patch ------------------------------------------------------------
const library = new FixtureLibrary();
await library.loadFromDirectory(path.resolve(__dirname, '..', 'fixtures'));
const parDef = library.get('Generic/PAR RGBW 4ch');

const engine = new Engine({ refreshHz: 30 });
engine.universes.ensure(0, 'Stage');

const patch = new Patch();
const fixtures: Fixture[] = [];
for (let i = 0; i < 4; i++) {
  const fx = patch.add(new Fixture({
    id: `par${i + 1}`, definition: parDef!,
    universeId: 0, startAddress: 1 + i * 4,
  }));
  fixtures.push(fx);
}
const all = new GroupManager().add(new Group({ id: 'all', name: 'All PARs' }));
fixtures.forEach((fx) => all.add(fx));

// ---- helpers ----------------------------------------------------------
function recordScene(id: string, name: string, draw: () => void): Scene {
  // Clear programmer for this fixture set so the snapshot is clean.
  for (const fx of fixtures) fx.applyDefaults();
  draw();                                  // user writes a look
  patch.applyAll(engine.universes);        // → programmer buffer
  const sc = Scene.snapshot({
    id, name,
    universes: [engine.universes.get(0)!],
    fixtures,                              // restrict to PAR channels
  });
  return sc;
}

// ---- 1. build three scenes -------------------------------------------
const sceneRed = recordScene('s1', 'All Red', () => {
  for (const fx of fixtures) fx.setRGBW(255, 0, 0, 0);
});

const sceneOcean = recordScene('s2', 'Ocean', () => {
  fixtures[0].setRGBW(0, 100, 255, 0);
  fixtures[1].setRGBW(0, 60, 255, 0);
  fixtures[2].setRGBW(0, 80, 200, 0);
  fixtures[3].setRGBW(20, 120, 255, 0);
});

const sceneSunrise = recordScene('s3', 'Sunrise', () => {
  fixtures[0].setRGBW(255,  60,   0, 0);
  fixtures[1].setRGBW(255, 120,   0, 0);
  fixtures[2].setRGBW(255, 180,   0, 0);
  fixtures[3].setRGBW(255, 220, 100, 0);
});

console.log('Recorded scenes:', sceneRed.id, sceneOcean.id, sceneSunrise.id);

// Clear programmer so live programmer doesn't show through scenes.
for (const fx of fixtures) fx.applyDefaults();
patch.applyAll(engine.universes);

// ---- 2. register in SceneMixer --------------------------------------
for (const sc of [sceneRed, sceneOcean, sceneSunrise]) {
  engine.scenes!.addTrack(sc.toMixerTrack({ blend: 'ltp', opacity: 0 }));
}

// ---- 3. crossfader ---------------------------------------------------
function go(targetId: string, fadeMs = 1500) {
  const startOpacities: Record<string, number> = {};
  for (const t of engine.scenes!.tracks.values()) startOpacities[t.id] = t.opacity;
  const start = performance.now();

  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / fadeMs);
    for (const id of Object.keys(startOpacities)) {
      const target = id === targetId ? 1 : 0;
      engine.scenes!.setOpacity(id, startOpacities[id] + (target - startOpacities[id]) * t);
    }
    if (t < 1) setImmediate(tick);
  };
  tick();
  console.log(`→ scene ${targetId} (fade ${fadeMs}ms)`);
}

engine.start();

// ---- 4. play sequence ------------------------------------------------
const u = engine.universes.get(0)!;
const dump = (label: string) => {
  const ch = [...u.data.slice(0, 16)].join(' ');
  console.log(`  ${label.padEnd(18)} ch1..16 = ${ch}`);
};

go('s1', 1000);
setTimeout(() => dump('s1 full'), 1100);

setTimeout(() => go('s2', 1500), 1600);
setTimeout(() => dump('s2 full'), 3200);

setTimeout(() => go('s3', 1500), 3700);
setTimeout(() => dump('s3 full'), 5300);

setTimeout(() => go('s1', 800), 5800);
setTimeout(() => dump('back to s1'), 6700);

setTimeout(async () => { engine.stop(); process.exit(0); }, 7300);

process.on('SIGINT', () => { engine.stop(); process.exit(0); });
