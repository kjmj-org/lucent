'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Minimal, explicit API surface exposed to the renderer. No Node access leaks
// through — everything goes over IPC to the main process.
contextBridge.exposeInMainWorld('lucent', {
  getPresets: () => ipcRenderer.invoke('get-presets'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  resolvePaths: (paths) => ipcRenderer.invoke('resolve-paths', paths),
  analyze: (filePath, preset) => ipcRenderer.invoke('analyze', filePath, preset),
  preview: (filePath, options) => ipcRenderer.invoke('preview', filePath, options),
  originalPreview: (filePath) => ipcRenderer.invoke('original-preview', filePath),
  export: (jobs) => ipcRenderer.invoke('export', jobs),
  openFolder: (dir) => ipcRenderer.invoke('open-folder', dir),
  // Resolve absolute paths from dropped File objects (Electron >= 32 removes
  // File.path; webUtils.getPathForFile is the supported replacement).
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch (_) { return file.path || null; }
  }
});
