// html.js — escape helper for building markup with innerHTML.
//
// Renderer tiles compose HTML strings that interpolate user-controlled data
// (fixture / scene / group names, search queries, error messages, and the ids
// of user-authored fixture definitions which are `Manufacturer/Model`). Without
// escaping, a crafted name like `<img src=x onerror=…>` loaded from a project
// file would inject DOM. Wrap every dynamic string with esc(); it is safe in
// both text and double-quoted attribute contexts.

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for safe interpolation into an HTML string. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}
