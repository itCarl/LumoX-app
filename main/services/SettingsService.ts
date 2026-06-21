// SettingsService — application-level preferences (language, appearance, DMX
// defaults, autosave/startup). Machine-scoped, NOT part of a project: persisted
// as `settings.json` in the Electron `userData` directory. Pure store + I/O — the
// side effects (broadcast output, autosave timer, renderer push) live with the
// modules that own them and subscribe to `settingsEvents`.

import { app } from 'electron';
import { EventEmitter } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppSettings, AppLanguage, DmxProtocol, TempoSource } from '../dto';

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  accent: '#5eb3ff',                 // matches the CSS --accent default
  dmxProtocol: 'artnet',
  broadcastHost: '255.255.255.255',
  maxRateHz: 40,
  autosaveMinutes: 5,
  reopenLastProject: false,
  lastProjectPath: null,
  tempoSource: 'manual',
  midiClockInput: null,
  audioInput: null,
  audioBands: 8,
};

// Events:
//   'loaded'  (settings)               — once, after the file is read at boot
//   'changed' (settings, changedKeys)  — after every successful update
// so the shell can react: recreate the broadcast output, (re)schedule autosave,
// push to the renderer. `changedKeys` lets a listener ignore updates it doesn't
// care about (e.g. don't tear down the UDP socket when only the accent changed).
export const settingsEvents = new EventEmitter();

let settings: AppSettings = { ...DEFAULT_SETTINGS };
let filePath = '';

const file = (): string =>
  filePath || (filePath = path.join(app.getPath('userData'), 'settings.json'));

const LANGUAGES = new Set<AppLanguage>(['en', 'de']);
const PROTOCOLS = new Set<DmxProtocol>(['artnet', 'sacn']);
const TEMPO_SOURCES = new Set<TempoSource>(['manual', 'midi', 'audio', 'link']);
const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Coerce arbitrary parsed JSON into a valid AppSettings, field by field. */
function sanitize(o: unknown): AppSettings {
  const r = (o ?? {}) as Record<string, unknown>;
  const num = (v: unknown, def: number, lo: number, hi: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), lo, hi) : def;
  return {
    language: LANGUAGES.has(r.language as AppLanguage) ? (r.language as AppLanguage) : DEFAULT_SETTINGS.language,
    accent: typeof r.accent === 'string' && HEX.test(r.accent) ? r.accent : DEFAULT_SETTINGS.accent,
    dmxProtocol: PROTOCOLS.has(r.dmxProtocol as DmxProtocol) ? (r.dmxProtocol as DmxProtocol) : DEFAULT_SETTINGS.dmxProtocol,
    broadcastHost: typeof r.broadcastHost === 'string' && r.broadcastHost.trim() ? r.broadcastHost.trim() : DEFAULT_SETTINGS.broadcastHost,
    maxRateHz: num(r.maxRateHz, DEFAULT_SETTINGS.maxRateHz, 1, 60),
    autosaveMinutes: num(r.autosaveMinutes, DEFAULT_SETTINGS.autosaveMinutes, 0, 120),
    reopenLastProject: typeof r.reopenLastProject === 'boolean' ? r.reopenLastProject : DEFAULT_SETTINGS.reopenLastProject,
    lastProjectPath: typeof r.lastProjectPath === 'string' && r.lastProjectPath ? r.lastProjectPath : null,
    tempoSource: TEMPO_SOURCES.has(r.tempoSource as TempoSource) ? (r.tempoSource as TempoSource) : DEFAULT_SETTINGS.tempoSource,
    midiClockInput: typeof r.midiClockInput === 'string' && r.midiClockInput ? r.midiClockInput : null,
    audioInput: typeof r.audioInput === 'string' && r.audioInput ? r.audioInput : null,
    audioBands: num(r.audioBands, DEFAULT_SETTINGS.audioBands, 1, 32),
  };
}

/** Read settings.json into memory (call once after app ready). Missing/corrupt → defaults. */
export async function loadSettings(): Promise<AppSettings> {
  try {
    settings = sanitize(JSON.parse(await readFile(file(), 'utf8')));
  } catch {
    settings = { ...DEFAULT_SETTINGS };   // first run or unreadable file
  }
  settingsEvents.emit('loaded', getSettings());
  return getSettings();
}

export const getSettings = (): AppSettings => ({ ...settings });
export const getSetting = <K extends keyof AppSettings>(k: K): AppSettings[K] => settings[k];

async function persist(): Promise<void> {
  try {
    await writeFile(file(), JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('[settings] write failed:', (err as Error).message);
  }
}

/** Merge a partial update, persist, and emit 'changed' with the keys that moved. */
export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const prev = settings;
  const next = sanitize({ ...settings, ...patch });
  const changed = (Object.keys(next) as (keyof AppSettings)[]).filter((k) => next[k] !== prev[k]);
  if (!changed.length) return getSettings();
  settings = next;
  await persist();
  settingsEvents.emit('changed', getSettings(), changed);
  return getSettings();
}

/** Record the most recent project path (for reopen-on-launch). No-op if unchanged. */
export function setLastProjectPath(p: string | null): void {
  if (settings.lastProjectPath === p) return;
  void updateSettings({ lastProjectPath: p });
}
