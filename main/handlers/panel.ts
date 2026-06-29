// Panel-window IPC — opens the generic panel window that hosts the app's richer
// former modals (Settings, group fixture-order) as real taskbar windows. The
// renderer asks to open a panel; the panel page fetches its spec on load.

import { ipcMain } from 'electron';
import { openPanelWindow } from '../windows';

export interface PanelSpec {
  kind: 'settings' | 'group-order' | 'create-matrix';
  title: string;
  arg?: unknown;
  width?: number;
  height?: number;
}

let currentPanel: PanelSpec | null = null;

export function registerPanelHandlers(): void {
  ipcMain.handle('lumox:panel:open', (_e, spec: PanelSpec) => {
    currentPanel = spec;
    openPanelWindow(spec.width ?? 460, spec.height ?? 560);
  });
  ipcMain.handle('lumox:panel:spec', () => currentPanel);
}
