import { build } from 'vite';
import path from 'path';
import fs from 'fs';

const root = path.resolve('.');

async function run() {
  console.log('--- Starting Extension Build ---');

  // Clean dist
  fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

  // 1. Build Bridge Script (IIFE)
  console.log('[1/4] Building Bridge Script...');
  await build({
    configFile: false,
    publicDir: false,
    build: {
      outDir: path.resolve(root, 'dist/content'),
      emptyOutDir: false,
      lib: {
        entry: path.resolve(root, 'src/content/bridge.ts'),
        name: 'YTBridge',
        formats: ['iife'],
        fileName: () => 'bridge.js'
      }
    }
  });

  // 2. Build Content Script (IIFE)
  console.log('[2/4] Building Content Script...');
  await build({
    configFile: false,
    publicDir: false,
    build: {
      outDir: path.resolve(root, 'dist/content'),
      emptyOutDir: false,
      lib: {
        entry: path.resolve(root, 'src/content/index.ts'),
        name: 'YTContent',
        formats: ['iife'],
        fileName: () => 'index.js'
      }
    }
  });

  // 3. Build Background Service Worker
  console.log('[3/4] Building Service Worker...');
  await build({
    configFile: false,
    publicDir: false,
    build: {
      outDir: path.resolve(root, 'dist/background'),
      emptyOutDir: false,
      lib: {
        entry: path.resolve(root, 'src/background/service-worker.ts'),
        name: 'YTServiceWorker',
        formats: ['iife'],
        fileName: () => 'service-worker.js'
      }
    }
  });

  // 4. Build Popup (HTML App)
  console.log('[4/4] Building Popup...');
  await build({
    configFile: false,
    publicDir: false,
    root: path.resolve(root, 'src/popup'),
    base: './',
    build: {
      outDir: path.resolve(root, 'dist/popup'),
      emptyOutDir: false,
      rollupOptions: {
        input: path.resolve(root, 'src/popup/popup.html'),
      }
    }
  });

  // 5. Copy manifest.json & icons to dist
  console.log('[5/5] Copying Manifest and Assets...');
  fs.copyFileSync(path.join(root, 'public/manifest.json'), path.join(root, 'dist/manifest.json'));
  fs.cpSync(path.join(root, 'public/icons'), path.join(root, 'dist/icons'), { recursive: true });

  console.log('✅ Build Complete! Unpacked extension ready at dist/');
}

run().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
