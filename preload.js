// IPC bridge for the clickable tag (#9) and the draggable plane (#11).
// Sandboxed preload: only these calls are exposed; the page never touches
// ipcRenderer directly.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jiraPlane', {
  setTagHot: (hot) => ipcRenderer.send('tag-hot', hot),
  openTicket: () => ipcRenderer.send('open-ticket'),
  // Drag (#11/#15): pause/resume the teardown schedule; endAtMs is the projected
  // flight-end wall-clock time (re-seeds and the fast exit both move it)
  dragging: (on, endAtMs) => ipcRenderer.send('dragging', { on, endAtMs }),
  // Multi-display drag (#11): the drag-owning window broadcasts rig state while
  // the plane deviates from course; other windows render from it.
  flightState: (state) => ipcRenderer.send('flight-state', state),
  onFlightState: (cb) => ipcRenderer.on('flight-state', (e, state) => cb(state)),
  // #21: flight start arrives over IPC once main confirms every overlay is on
  // its intended display (multi-display Electron flights only).
  onFlightStart: (cb) => ipcRenderer.on('flight-start', (e, startAt) => cb(startAt)),
});
