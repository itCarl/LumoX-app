import { defineConfig } from 'vitest/config';

// Engine tests run the headless `src/` core in a plain Node environment — no
// Electron, no DOM. Specs live under `test/`, mirroring the engine's layout
// (the same convention that keeps `examples/`, `cli/`, `tools/` out of `src/`).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
  },
});
