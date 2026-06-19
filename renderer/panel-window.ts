// Generic panel window — a frameless window (own taskbar entry) that hosts the
// app's richer panels (Settings, group fixture-order) which were formerly in-app
// modals. It fetches its spec from main, builds the matching panel body, and
// mounts it. Closing is via the titlebar X or Escape.

import { buildSettingsBody } from './views/settings-modal';
import { buildGroupOrderBody } from './views/group-order-modal';

const { lumox } = window;

interface PanelSpec { kind: 'settings' | 'group-order'; title: string; arg?: any }

const titleEl = document.getElementById('panel-title') as HTMLElement;
const root = document.getElementById('panel-root') as HTMLElement;

(document.getElementById('ew-close') as HTMLElement).addEventListener('click', () => lumox.win.closeSelf());
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') lumox.win.closeSelf(); });

async function bodyFor(spec: PanelSpec): Promise<HTMLElement | null> {
  if (spec.kind === 'settings') return buildSettingsBody();
  if (spec.kind === 'group-order') return buildGroupOrderBody(spec.arg?.groupId);
  return null;
}

lumox.panel.spec().then(async (spec: PanelSpec | null) => {
  if (!spec) { lumox.win.closeSelf(); return; }
  titleEl.textContent = spec.title;
  document.title = spec.title;
  const body = await bodyFor(spec).catch(() => null);
  if (body) root.appendChild(body);
}).catch(() => lumox.win.closeSelf());
