// IPC bridge for the tray popover (#38). Separate from preload.js and
// preload-settings.js so each page gets only its own calls. Main pushes the
// state (#39); intents, a row to replay (#40) and the panel height go back.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jiraPlanePopover', {
  onState: (cb) => ipcRenderer.on('popover-state', (e, state) => cb(state)),
  setPaused: (paused) => ipcRenderer.send('popover-set-paused', paused),
  replay: (index) => ipcRenderer.send('popover-replay', index),
  fit: (height) => ipcRenderer.send('popover-fit', height),
  testFlight: () => ipcRenderer.send('popover-test-flight'),
  openSettings: () => ipcRenderer.send('popover-open-settings'),
  quit: () => ipcRenderer.send('popover-quit'),
  update: () => ipcRenderer.send('popover-update'),
});
