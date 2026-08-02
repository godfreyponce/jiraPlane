const { app, Tray, Menu, BrowserWindow, screen, nativeImage } = require('electron');
const path = require('path');
const poller = require('./poller');

// Flight speed at the accepted feel: the #3/#4 design crossed the 1512-DIP dev
// screen plus ~234px of offscreen margins in 10s.
const SPEED_PX_S = 175;
// Delay between window creation and the synced animation start; overlay pages
// load in ~350ms (measured), this covers cold starts.
const START_LEAD_MS = 700;

let tray = null;
let pollingPaused = false;

const flightQueue = [];
let activeFlight = null;

function enqueueFlight(event) {
  flightQueue.push(event);
  flyNext();
}

function flyNext() {
  if (activeFlight || flightQueue.length === 0) return;
  const event = flightQueue.shift();
  const wins = createFlight(event);
  activeFlight = wins;
  let open = wins.length;
  wins.forEach((win) =>
    win.on('closed', () => {
      if (--open === 0) {
        activeFlight = null;
        flyNext();
      }
    })
  );
}

// One continuous flight across the whole desktop: one overlay per display,
// each rendering its slice of a single global path, synced to a shared
// wall-clock start (issue #6).
function createFlight(event) {
  const displays = screen.getAllDisplays();
  const minX = Math.min(...displays.map((d) => d.bounds.x));
  const maxX = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width));
  const primary = screen.getPrimaryDisplay();
  // Global flight line: a third down the primary display, like the accepted
  // single-screen look.
  const flyY = Math.round(primary.bounds.y + primary.bounds.height * 0.32);
  // Entry/exit margins mirror plane.html's rig: ~194px offscreen entry
  // (-110% of the ~176px rig), 40px exit.
  const spanPx = maxX + 40 - (minX - 194);
  const durMs = Math.round((spanPx / SPEED_PX_S) * 1000);
  const start = Date.now() + START_LEAD_MS;
  const leftmost = displays.reduce((a, b) => (a.bounds.x <= b.bounds.x ? a : b));
  const wins = displays.map((d) => {
    const win = new BrowserWindow({
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
      transparent: true,
      frame: false,
      hasShadow: false,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      fullscreenable: false,
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true, autoplayPolicy: 'no-user-gesture-required' },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true);
    // false + visibleOnFullScreen: keeps flights visible over full-screen apps
    // WITHOUT canJoinAllSpaces — with true, macOS drags the window to the
    // focused display, which put primary-sized flights on the wrong monitor.
    win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
    win.loadFile('plane.html', {
      query: {
        type: event.type,
        issueKey: event.issueKey,
        snippet: event.snippet,
        start: String(start),
        dur: String(durMs),
        minX: String(minX),
        maxX: String(maxX),
        flyY: String(flyY),
        audio: d.id === leftmost.id ? '1' : '0',
      },
    });
    win.once('ready-to-show', () => win.showInactive());
    return win;
  });
  setTimeout(() => {
    wins.forEach((win) => {
      if (!win.isDestroyed()) win.destroy();
    });
  }, START_LEAD_MS + durMs + 1000);
  return wins;
}

function startPolling() {
  if (poller.configError) {
    console.error(`Polling disabled: ${poller.configError.message}`);
    return;
  }
  let cycleInFlight = false;
  const tick = async () => {
    // Skip while paused, and never overlap a slow cycle with the next one.
    if (pollingPaused || cycleInFlight) return;
    cycleInFlight = true;
    try {
      (await poller.cycle()).forEach(enqueueFlight);
    } catch (e) {
      console.error(`poll cycle failed: ${e.message}`);
    } finally {
      cycleInFlight = false;
    }
  };
  tick();
  setInterval(tick, poller.config.pollSeconds * 1000);
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
  startPolling();
  if (process.env.TEST_FLIGHT === '1') testFlight();
});

// Menu-bar app: stay alive with no windows open.
app.on('window-all-closed', () => {});
