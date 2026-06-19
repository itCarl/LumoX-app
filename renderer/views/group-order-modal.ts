// Group order editor — drag-reorder a group's fixtures. The stored order is the
// group's "fixture index": an FX layer targeting this group fans/phases across it
// in this order (see docs/knowledge-base/selection.md). Persists via
// `lumox.groups.setFixtures(id, orderedIds)`, which re-fans live FX immediately.

import { bus, EV } from '../lib/bus';
import { node, html } from '../lib/dom';
import { esc } from '../lib/html';
import { button } from '../lib/widgets';

const { lumox } = window;

export async function openGroupOrderModal(groupId: string, groupName: string): Promise<void> {
  document.querySelector('.lx-modal-backdrop')?.remove();

  let fixtures: any[] = [];
  let group: any = null;
  try {
    const [all, groups] = await Promise.all([lumox.patch.list(), lumox.groups.list()]);
    group = groups.find((g: any) => g.id === groupId);
    const byId = new Map(all.map((f: any) => [f.id, f]));
    fixtures = (group?.fixtureIds ?? []).map((id: string) => byId.get(id)).filter(Boolean);
  } catch { return; }
  if (!group) return;

  // Working order (array of fixture objects); persisted on every drop.
  let order = [...fixtures];
  const listEl = node(html`<ul class="ord-list"></ul>`);

  const persist = () => {
    void lumox.groups.setFixtures(groupId, order.map((f) => f.id));
    bus.emit(EV.GROUPS_CHANGED);
  };

  let dragIndex = -1;
  function renderRows() {
    listEl.innerHTML = order.map((f, i) => `
      <li class="ord-row" draggable="true" data-i="${i}">
        <span class="ord-handle"><i class="fa-solid fa-grip-vertical"></i></span>
        <span class="ord-idx">${i + 1}</span>
        <span class="ord-dot" style="background:${esc(f.color || '#6b6b6b')}"></span>
        <span class="ord-name">${esc(f.name)}</span>
        <span class="ord-addr">@${f.startAddress}</span>
      </li>`).join('');
  }
  renderRows();

  listEl.addEventListener('dragstart', (e) => {
    const row = (e.target as HTMLElement).closest('.ord-row') as HTMLElement | null;
    if (!row) return;
    dragIndex = Number(row.dataset.i);
    (e as DragEvent).dataTransfer!.effectAllowed = 'move';
    row.classList.add('dragging');
  });
  listEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    const row = (e.target as HTMLElement).closest('.ord-row') as HTMLElement | null;
    if (!row || dragIndex < 0) return;
    const over = Number(row.dataset.i);
    if (over === dragIndex) return;
    const [moved] = order.splice(dragIndex, 1);
    order.splice(over, 0, moved);
    dragIndex = over;
    renderRows();
    listEl.querySelector(`[data-i="${over}"]`)?.classList.add('dragging');
  });
  listEl.addEventListener('dragend', () => {
    if (dragIndex >= 0) persist();
    dragIndex = -1;
    renderRows();
  });

  const el = node(html`
    <div class="lx-modal-backdrop">
      <div class="lx-modal" role="dialog" aria-modal="true">
        <div class="lx-modal-head">Fixture order — ${esc(groupName)}</div>
        <div class="lx-modal-body"></div>
        <div class="lx-modal-foot"></div>
      </div>
    </div>`);
  const body = el.querySelector('.lx-modal-body') as HTMLElement;
  if (order.length) {
    body.appendChild(node(html`<p class="lx-form-hint">Drag to reorder — this is the order effects fan / phase across the group.</p>`));
    body.appendChild(listEl);
  } else {
    body.appendChild(node(html`<p class="muted pad">This group has no fixtures.</p>`));
  }
  (el.querySelector('.lx-modal-foot') as HTMLElement).appendChild(button({ label: 'Done', variant: 'primary', onClick: () => close() }));

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  const close = () => { el.remove(); window.removeEventListener('keydown', onKey); };
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  window.addEventListener('keydown', onKey);
  document.body.appendChild(el);
}
