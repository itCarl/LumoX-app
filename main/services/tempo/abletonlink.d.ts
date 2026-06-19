// Ambient stub for the OPTIONAL `abletonlink` native addon (Ableton Link tempo
// source). It is not a declared dependency the build can resolve — it's loaded at
// runtime via `import('abletonlink')` and only when the user installs it. This
// declaration lets the codebase type-check (as `any`) whether or not it's present;
// LinkSource guards every access defensively. See LinkSource.ts.
declare module 'abletonlink';
