import { defineConfig } from '@playwright/test';

// End-to-end tests drive the REAL Electron app (main process + engine + preload +
// renderer) through Playwright's Electron driver — see e2e/fixtures.ts. Electron
// renders in its bundled Chromium only, so there is no Firefox/Chrome project here;
// the renderer cannot run outside Electron (it depends on the `window.lumox` IPC
// bridge). The window is forced to a 1920×1080 content box in the fixture.
//
// The app enforces a single running instance (requestSingleInstanceLock) and owns
// exclusive Art-Net/sACN sockets, so the suite is strictly serial: one app at a
// time. Each spec file gets its own freshly-booted app (worker-scoped), reset
// between tests.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
