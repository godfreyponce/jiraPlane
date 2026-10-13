// IPC bridge for the tray popover (#38). Separate from preload.js and
// preload-settings.js so each page gets only its own calls. Intents go out;
// the header and list stay empty until #39 and #40 push real state.
const { contextBridge, ipcRenderer } = require('electron');
const EMPTY = { lastPollAt: null, pollingPaused: false, configError: null, flights: [] };
let render = () => {};
contextBridge.exposeInMainWorld('jiraPlanePopover', {
  onState: (cb) => { render = cb; cb(EMPTY); },
  setPaused: () => render(EMPTY), // not wired until #39: the switch snaps back off
  testFlight: () => ipcRenderer.send('popover-test-flight'),
  openSettings: () => ipcRenderer.send('popover-open-settings'),
  quit: () => ipcRenderer.send('popover-quit'),
});
