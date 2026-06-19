// Project IPC — New / Save / Save As / Open dialogs + file I/O, and the current
// project identity. (De)serialization lives in ProjectService; this layer owns
// the Electron dialog + fs, and forwards project identity changes (name / path /
// dirty) to the renderer titlebar.

import { ipcMain, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getMainWindow, setCloseGuard } from '../windows';
import { openDialog } from './dialog';
import {
  buildProject, newProject, setProject, projectInfo, projectEvents,
  loadProjectFromPath, setReport, takeReport,
} from '../services/ProjectService';
import { resetHistory } from '../services/HistoryService';
import { getSetting, setLastProjectPath, settingsEvents } from '../services/SettingsService';
import type { AppSettings } from '../dto';

// `.lmx` is the one and only Lumox project extension.
const FILTERS = [{ name: 'Lumox Project', extensions: ['lmx'] }];

const baseName = (p: string): string => path.basename(p).replace(/\.lmx$/i, '');

async function writeProject(filePath: string, name: string): Promise<void> {
  const data = buildProject();
  data.name = name;
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  setProject(name, filePath);
  setLastProjectPath(filePath);
}

/**
 * Before the window closes with unsaved changes, ask Save / Don't Save / Cancel
 * via the in-app dialog window (a real window, not a native OS message box).
 * Returns true when it's OK to proceed (saved or discarded), false to abort the
 * close — including when the user cancels Save As for an unsaved show.
 */
async function confirmCloseIfDirty(): Promise<boolean> {
  const cur = projectInfo();
  if (!cur.dirty) return true;
  const choice = await openDialog({
    title: 'Unsaved changes',
    message: `Save changes to “${cur.name}” before closing?`,
    detail: "Your changes will be lost if you don't save them.",
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'dont-save', label: "Don't Save", variant: 'danger' },
      { id: 'save', label: 'Save', variant: 'primary' },
    ],
    cancelId: 'cancel',
    width: 460, height: 188,
  });
  if (choice === 'cancel') return false;       // Cancel → abort close
  if (choice === 'dont-save') return true;      // Don't Save → discard + close
  if (cur.path) { await writeProject(cur.path, cur.name); return true; }
  return (await saveAs()).saved;                // unsaved show → Save As; abort if cancelled
}

async function saveAs(): Promise<{ saved: boolean; path?: string }> {
  const { canceled, filePath } = await dialog.showSaveDialog(getMainWindow()!, {
    title: 'Save Project', defaultPath: `${projectInfo().name}.lmx`, filters: FILTERS,
  });
  if (canceled || !filePath) return { saved: false };
  await writeProject(filePath, baseName(filePath));
  return { saved: true, path: filePath };
}

// Autosave timer — period comes from settings (0 = off); rescheduled whenever the
// `autosaveMinutes` setting changes. Saves a named project with unsaved changes.
let autosaveTimer: ReturnType<typeof setInterval> | null = null;
function scheduleAutosave(): void {
  if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer = null; }
  const minutes = getSetting('autosaveMinutes');
  if (!minutes || minutes <= 0) return;   // disabled
  autosaveTimer = setInterval(async () => {
    const cur = projectInfo();
    if (!cur.path || !cur.dirty) return;
    try {
      await writeProject(cur.path, cur.name);
      console.log(`[project] autosaved ${cur.path}`);
    } catch (err) {
      console.error('[project] autosave failed:', (err as Error).message);
    }
  }, minutes * 60 * 1000);
}

export function registerProjectHandlers(): void {
  // Push identity changes (dirty flips, renames, save/open) to the titlebar.
  projectEvents.on('changed', (info) => getMainWindow()?.webContents.send('project:changed', info));

  // Guard the window close: prompt Save / Don't Save / Cancel when there are
  // unsaved changes (the window won't close until this resolves).
  setCloseGuard(confirmCloseIfDirty);

  // Schedule once settings are loaded, and reschedule when the interval changes.
  settingsEvents.on('loaded', scheduleAutosave);
  settingsEvents.on('changed', (_s: AppSettings, changed: (keyof AppSettings)[]) => {
    if (changed.includes('autosaveMinutes')) scheduleAutosave();
  });

  ipcMain.handle('lumox:project:info', () => projectInfo());

  // Pending discrepancy report from the last open (fetched + cleared after the
  // renderer rebuilds, so the popup survives the reload).
  ipcMain.handle('lumox:project:report', () => takeReport());

  ipcMain.handle('lumox:project:new', () => {
    setReport([]);
    newProject();
    resetHistory();
    getMainWindow()?.webContents.send('project:loaded');
    return projectInfo();
  });

  // Save to the known path silently; fall back to Save As for an unsaved project.
  ipcMain.handle('lumox:project:save', async () => {
    const cur = projectInfo();
    if (!cur.path) return saveAs();
    await writeProject(cur.path, cur.name);
    return { saved: true, path: cur.path };
  });

  ipcMain.handle('lumox:project:saveAs', () => saveAs());

  ipcMain.handle('lumox:project:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow()!, {
      title: 'Open Project', properties: ['openFile'], filters: FILTERS,
    });
    if (canceled || !filePaths?.length) return { loaded: false };
    const filePath = filePaths[0];
    await loadProjectFromPath(filePath);   // validates + restores + records report/identity
    setLastProjectPath(filePath);
    resetHistory();
    getMainWindow()?.webContents.send('project:loaded');
    return { loaded: true, path: filePath };
  });
}
