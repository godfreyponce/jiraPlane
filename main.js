const { app, Tray, Menu, BrowserWindow, screen, nativeImage } = require('electron');
const path = require('path');

// plane.html's flight animation runs ~5s; destroy the overlay shortly after.
const FLIGHT_MS = 6000;

let tray = null;
let pollingPaused = false; // stub — #2 wires the Jira poller to this

const flightQueue = [];
let activeFlight = null;

function enqueueFlight(event) {
  flightQueue.push(event);
  flyNext();
}

function flyNext() {
  if (activeFlight || flightQueue.length === 0) return;
  const event = flightQueue.shift();
  activeFlight = createOverlay(event);
  activeFlight.on('closed', () => {
    activeFlight = null;
    flyNext();
  });
}

function createOverlay(event) {
  const { bounds } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    hasShadow: false,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('plane.html', {
    query: {
      type: event.type,
      issueKey: event.issueKey,
      snippet: event.snippet,
    },
  });
  win.once('ready-to-show', () => win.showInactive());
  setTimeout(() => {
    if (!win.isDestroyed()) win.destroy();
  }, FLIGHT_MS);
  return win;
}

function testFlight() {
  enqueueFlight({
    type: 'assigned',
    issueKey: 'PROJ-142',
    snippet: 'Fix login redirect',
  });
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'Test flight', click: testFlight },
    { type: 'separator' },
    {
      label: pollingPaused ? 'Resume polling' : 'Pause polling',
      click: () => {
        pollingPaused = !pollingPaused;
        tray.setContextMenu(buildMenu());
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

app.whenReady().then(() => {
  app.dock.hide();
  const icon = nativeImage.createFromPath(
    path.join(__dirname, 'assets', 'iconTemplate.png')
  );
  tray = new Tray(icon);
  tray.setToolTip('jiraPlane');
  tray.setContextMenu(buildMenu());
  if (process.env.TEST_FLIGHT === '1') testFlight();
});

// Menu-bar app: stay alive with no windows open.
app.on('window-all-closed', () => {});
