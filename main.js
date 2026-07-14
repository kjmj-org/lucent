'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const { analyze } = require('./src/analyzer');
const optimizer = require('./src/optimizer');
const { DEFAULT_PRESETS } = require('./src/presets');

const SUPPORTED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.gif']);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0f1115',
    title: 'Lucent',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Open external links in the system browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC handlers ---------------------------------------------------------

ipcMain.handle('get-presets', () => DEFAULT_PRESETS);

// Open a native file picker; returns absolute paths of chosen images.
ipcMain.handle('pick-files', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Add images',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'gif'] }]
  });
  if (res.canceled) return [];
  return res.filePaths;
});

// Given a list of dropped paths (files or folders), expand to supported images.
ipcMain.handle('resolve-paths', (_e, paths) => {
  const out = [];
  const visit = (p) => {
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        for (const entry of fs.readdirSync(p)) visit(path.join(p, entry));
      } else if (SUPPORTED.has(path.extname(p).toLowerCase())) {
        out.push(p);
      }
    } catch (_) { /* ignore unreadable paths */ }
  };
  for (const p of paths) visit(p);
  return out;
});

ipcMain.handle('analyze', async (_e, filePath, preset) => {
  try {
    return { ok: true, data: await analyze(filePath, preset) };
  } catch (err) {
    return { ok: false, error: err.message, filePath };
  }
});

ipcMain.handle('preview', async (_e, filePath, options) => {
  try {
    const data = await optimizer.preview(filePath, options);
    // Score the optimized output (reusing the buffer preview built) so the UI
    // can show the "after" score, then drop the buffer from the payload.
    const buf = data._buf;
    delete data._buf;
    data.optimizedAnalysis = await analyze(buf, options.preset, { skipThumb: true, optimized: true });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Return the original image as a data URL (downscaled for the preview panel).
ipcMain.handle('original-preview', async (_e, filePath) => {
  const sharp = require('sharp');
  try {
    const buf = await sharp(filePath, { failOn: 'none' })
      .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .toBuffer();
    const meta = await sharp(filePath, { failOn: 'none' }).metadata();
    const mime = meta.format === 'png' ? 'image/png' : 'image/jpeg';
    return { ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Batch export. `jobs` = [{ filePath, options }]. Prompts once for a folder.
ipcMain.handle('export', async (_e, jobs) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose export folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled) return { ok: false, canceled: true };
  const outDir = res.filePaths[0];

  const results = [];
  for (const job of jobs) {
    try {
      const r = await optimizer.exportOne(job.filePath, outDir, job.options);
      results.push({ ok: true, ...r });
    } catch (err) {
      results.push({ ok: false, filePath: job.filePath, error: err.message });
    }
  }
  return { ok: true, outDir, results };
});

ipcMain.handle('open-folder', (_e, dir) => {
  shell.openPath(dir);
});
