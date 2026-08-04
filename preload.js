// IPC bridge for the clickable tag (#9) and the draggable plane (#11).
// Sandboxed preload: only these calls are exposed; the page never touches
// ipcRenderer directly.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jiraPlane', {
  setTagHot: (hot) => ipcRenderer.send('tag-hot', hot),
  openTicket: () => ipcRenderer.send('open-ticket'),
  // Drag (#11): pause/resume the flight schedule; pausedMs is the accumulated hold time
  dragging: (on, pausedMs) => ipcRenderer.send('dragging', { on, pausedMs }),
  // Multi-display drag (#11): the drag-owning window broadcasts rig state while
  // the plane deviates from course; other windows render from it.
  flightState: (state) => ipcRenderer.send('flight-state', state),
  onFlightState: (cb) => ipcRenderer.on('flight-state', (e, state) => cb(state)),
});
