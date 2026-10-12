// IPC bridge for the settings window (#29). Separate from preload.js so the
// overlay pages never get these setters. Intents go out; state comes back.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jiraPlaneSettings', {
  onState: (cb) => ipcRenderer.on('settings-state', (e, state) => cb(state)),
  set: (key, value) => ipcRenderer.send('settings-set', key, value),
  testFlight: () => ipcRenderer.send('settings-test-flight'),
  openRepo: () => ipcRenderer.send('settings-open-repo'),
});
