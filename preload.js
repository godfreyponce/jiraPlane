// IPC bridge for the clickable tag (#9). Sandboxed preload: only these two
// calls are exposed; the page never touches ipcRenderer directly.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jiraPlane', {
  setTagHot: (hot) => ipcRenderer.send('tag-hot', hot),
  openTicket: () => ipcRenderer.send('open-ticket'),
});
