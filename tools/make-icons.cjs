// Rasterize assets/icon.svg into the app's runtime icons — fully offline, no
// extra dependencies. Electron (already a dev dependency) renders the SVG via
// offscreen rendering at 1024px, then we downsample to each target size and
// assemble a multi-resolution .ico. Run with: npm run icons
//
// CommonJS (.cjs) on purpose: as an Electron main entry it gets the real
// main-process API from require('electron'); an ESM entry only sees the npm
// shim (a path string).
//
// Outputs (committed, used at runtime by main/windows.ts + the renderer):
//   assets/icon.ico    16/24/32/48/64/128/256 — Windows window + taskbar icon
//   assets/icon.png    256px — favicon / PNG icon fallback
//   assets/icon@2x.png 512px — HiDPI favicon

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'icon.svg');
const BASE = 1024;                              // render resolution (downsampled from)
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

// Software compositing + scale 1 make the offscreen 'paint' bitmap deterministic
// (exact pixels, no GPU/HiDPI scaling surprises).
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');

// Assemble a .ico from PNG-encoded entries (the modern, Vista+ container form).
// Layout: 6-byte ICONDIR header, 16-byte ICONDIRENTRY per image, then the PNGs.
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);                   // type: 1 = icon
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o);      // width  (0 ⇒ 256)
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1);  // height (0 ⇒ 256)
    dir.writeUInt16LE(1, o + 4);                        // colour planes
    dir.writeUInt16LE(32, o + 6);                       // bits per pixel
    dir.writeUInt32LE(e.png.length, o + 8);             // bytes of image data
    dir.writeUInt32LE(offset, o + 12);                  // offset to image data
    offset += e.png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

async function main() {
  await app.whenReady();

  const svg = fs.readFileSync(SRC, 'utf8');
  const html =
    `<!doctype html><meta charset="utf-8">` +
    `<style>html,body{margin:0;background:transparent}` +
    `svg{display:block;width:${BASE}px;height:${BASE}px}</style>${svg}`;

  const win = new BrowserWindow({
    width: BASE,
    height: BASE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
    webPreferences: { offscreen: true },
  });
  win.webContents.setFrameRate(10);

  // Wait for the first fully-painted, non-transparent frame at full resolution.
  const baseImage = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('offscreen paint timed out')), 20000);
    win.webContents.on('paint', (_e, _dirty, image) => {
      const { width, height } = image.getSize();
      if (width < BASE || height < BASE) return;
      const bmp = image.toBitmap();
      for (let i = 3; i < bmp.length; i += 4) {
        if (bmp[i] !== 0) { clearTimeout(timer); resolve(image); return; }  // any opaque pixel
      }
    });
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });

  const png = (size) =>
    baseImage.resize({ width: size, height: size, quality: 'best' }).toPNG();

  const outDir = path.join(ROOT, 'assets');
  fs.writeFileSync(path.join(outDir, 'icon.ico'), buildIco(ICO_SIZES.map((s) => ({ size: s, png: png(s) }))));
  fs.writeFileSync(path.join(outDir, 'icon.png'), png(256));
  fs.writeFileSync(path.join(outDir, 'icon@2x.png'), png(512));

  console.log(`[icons] wrote icon.ico (${ICO_SIZES.join(',')}), icon.png (256), icon@2x.png (512)`);
  win.destroy();
}

main().then(() => app.quit()).catch((err) => {
  console.error('[icons]', err);
  app.exit(1);
});
