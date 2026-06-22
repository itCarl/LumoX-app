// SceneOrchestrator — scene playback orchestration over the engine's SceneMixer:
// recall on/off with crossfades, the release/protect scope rules (which live
// scenes a recall clears), counted-loop completion (jump / release / pause), and
// the (re)build of a scene's live track in place. The fixture→address translation
// itself lives in SceneCompiler; this module decides *when* tracks fade, release,
// and rebuild.

import { Scene } from '../../src/index';
import { engine, show, banks } from '../context';
import { sceneTrack } from './SceneCompiler';
import { updateActiveUniverses } from './OutputPatchService';

/**
 * Guarantee the first bank always holds at least one scene. When bank 1 is empty
 * it creates a blank static "Scene 1" (show + engine track + bank membership) so
 * the CONTROL view always has a cue to recall, edit, or store into. Idempotent;
 * call after the banks settle (project new / load). Assumes a default bank exists.
 */
export function ensureDefaultScene(): void {
  const first = banks.list()[0];
  if (!first || first.sceneIds.length) return;
  const s = new Scene({ name: 'Scene 1' });
  show.addScene(s);
  engine.scenes.addTrack(sceneTrack(s));
  banks.addScene(first.id, s.id);
}

/**
 * Replace a scene's live track in place, preserving its current opacity AND its
 * playback phase clock — editing FX params (timing / config / targets) must
 * never snap the running animation back to zero. Recall still reseeds the phase
 * per the scene's start mode.
 */
export function rebuildSceneTrack(scene: Scene): void {
  const opacity = engine.scenes.tracks.get(scene.id)?.opacity ?? 0;
  const playback = engine.scenes.playback.get(scene.id);
  engine.scenes.removeTrack(scene.id);
  engine.scenes.addTrack(sceneTrack(scene, opacity));
  if (playback) engine.scenes.playback.set(scene.id, playback);
}

/** Rebuild every live scene that drives the selection so a selection change
 *  re-fans its effects immediately (opacity + phase preserved). Wired to the
 *  SelectionService change hook at boot (services/showRuntime.ts). */
export function rebuildSelectionTracks(): void {
  for (const s of show.listScenes()) {
    if (s.layers.some((L) => L.target.mode === 'selection')) rebuildSceneTrack(s);
  }
}

/** Effective fade time in seconds, scaled by the scene's fade-speed multiplier. */
function fadeSeconds(scene: Scene, dir: 'in' | 'out'): number {
  const base = dir === 'in' ? scene.fadeIn : scene.fadeOut;
  return Math.max(0, base) * Math.max(0.01, scene.fadeSpeed);
}

/**
 * Does recalling `actor` release `target`? `actor`'s release mode must cover the
 * target's scope AND the target must not shield itself via protect-from-release.
 * Bank ids are resolved by the caller (null = scene in no bank).
 */
function releases(actor: Scene, actorBank: string | null, target: Scene, targetBank: string | null): boolean {
  return inReleaseScope(actor, actorBank, targetBank) && !isProtected(target, targetBank, actorBank);
}
function inReleaseScope(actor: Scene, actorBank: string | null, targetBank: string | null): boolean {
  switch (actor.releaseMode) {
    case 'off': return false;
    case 'all': return true;
    case 'bank': return actorBank != null && actorBank === targetBank;
    case 'outside-bank': return actorBank !== targetBank;
    case 'specific': return targetBank != null && actor.releaseBanks.includes(targetBank);
  }
}
function isProtected(target: Scene, targetBank: string | null, actorBank: string | null): boolean {
  switch (target.protectFromRelease) {
    case 'off': return false;
    case 'all': return true;
    case 'bank': return targetBank != null && targetBank === actorBank;
    case 'outside-bank': return targetBank !== actorBank;
    case 'specific': return actorBank != null && target.protectBanks.includes(actorBank);
  }
}

/**
 * Recall a scene on/off. On recall it releases every live scene its release mode
 * covers (respecting each target's protect-from-release — the default 'bank'
 * release reproduces "one active scene per bank"), seeds the phase clock per the
 * scene's start mode, and refreshes the broadcast subscription.
 *
 * When the recall releases other scenes AND the incoming scene has a fade time,
 * the two are joined by a **dipless crossfade** (value-wise interpolation from the
 * outgoing combined look to the incoming look) so shared full channels don't dip;
 * the incoming `fadeIn` governs the crossfade duration. A recall with no released
 * scene (or no fade) just ramps the incoming opacity — already dipless on its own.
 */
export function recallScene(id: string, on: boolean): void {
  const scene = show.scenes.get(id);
  if (on) {
    if (scene) {
      const actorBank = banks.bankOf(id)?.id ?? null;
      const outgoing: string[] = [];
      for (const other of show.listScenes()) {
        if (other.id === id || !engine.scenes.isLive(other.id)) continue;
        const otherBank = banks.bankOf(other.id)?.id ?? null;
        if (releases(scene, actorBank, other, otherBank)) outgoing.push(other.id);
      }
      engine.scenes.resetPhase(id, scene.startMode);
      const t = fadeSeconds(scene, 'in');
      if (outgoing.length && t > 0) {
        engine.scenes.startTransition({ toId: id, level: scene.level, fromIds: outgoing, totalMs: t * 1000, preDelayMs: scene.phaseIn });
      } else {
        for (const oid of outgoing) {
          const o = show.scenes.get(oid);
          engine.scenes.fadeTo(oid, 0, o ? fadeSeconds(o, 'out') : 0, o?.phaseOut ?? 0);
        }
        engine.scenes.fadeTo(id, scene.level, t, scene.phaseIn);
      }
    } else {
      engine.scenes.fadeTo(id, 1, 0);
    }
  } else {
    engine.scenes.fadeTo(id, 0, scene ? fadeSeconds(scene, 'out') : 0, scene?.phaseOut ?? 0);
  }
  updateActiveUniverses();
}

/** Resolve a counted-loop jump target to a scene id (bank-relative for next/prev). */
function resolveJump(id: string, jump: NonNullable<Scene['jumpTo']>): string | null {
  if (jump.mode === 'scene') return jump.sceneId ?? null;
  const bank = banks.bankOf(id);
  if (!bank || !bank.sceneIds.length) return null;
  const i = bank.sceneIds.indexOf(id);
  if (i < 0) return null;
  const n = bank.sceneIds.length;
  const j = jump.mode === 'next' ? (i + 1) % n : (i - 1 + n) % n;
  return bank.sceneIds[j] ?? null;
}

/**
 * A scene's counted loop just finished. Jump to another scene if `jumpTo` is set;
 * otherwise release the scene (`releaseAtEnd`) or pause it on its final frame.
 */
export function handleLoopComplete(id: string): void {
  const s = show.scenes.get(id);
  if (!s) return;
  if (s.jumpTo) {
    const target = resolveJump(id, s.jumpTo);
    recallScene(id, false);
    if (target && target !== id) recallScene(target, true);
  } else if (s.releaseAtEnd) {
    recallScene(id, false);
  } else {
    engine.scenes.pause(id);
  }
  updateActiveUniverses();
}
