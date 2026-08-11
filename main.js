const { app, Tray, Menu, BrowserWindow, screen, nativeImage, shell, ipcMain } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const poller = require('./poller');
const teams = require('./teams');

// Login-launch (#7) means an instance may already be running when the owner
// starts a dev `npm start` — two pollers would double-fly and double-DM.
// Second instance exits immediately; quit the tray instance first for dev.
if (!app.requestSingleInstanceLock()) {
  console.log('jiraPlane already running — exiting this instance');
  app.quit();
}

// Flight speed at the accepted feel: the #3/#4 design crossed the 1512-DIP dev
// screen plus ~234px of offscreen margins in 10s.
const SPEED_PX_S = 175;
// Delay between window creation and the synced animation start; overlay pages
// load in ~350ms (measured), this covers cold starts.
const START_LEAD_MS = 700;

let tray = null;
let pollingPaused = false;

// Persisted user prefs (#10 bannerStyle, #28 flyOn): separate from state.json
// so resetting dedup state never loses them. Any read failure → defaults.
const SETTINGS_PATH = path.join(__dirname, 'settings.json');
let bannerStyle = 'cargo';
let flyOn = 'all'; // 'all' | 'main'; missing/unknown → 'all' (#28)
try {
  const saved = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  if (saved.bannerStyle === 'skywriter') bannerStyle = saved.bannerStyle;
  if (saved.flyOn === 'main') flyOn = saved.flyOn;
} catch { /* missing or invalid settings.json: keep defaults */ }

function saveSettings() {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ bannerStyle, flyOn }, null, 2) + '\n');
  tray.setContextMenu(buildMenu());
}

function setBannerStyle(style) {
  bannerStyle = style;
  saveSettings();
}

function setFlyOn(mode) {
  flyOn = mode;
  saveSettings();
}

const flightQueue = [];
let activeFlight = null;
let activeFlightUrl = ''; // browse URL for the flight in the air (#9); '' = not clickable
let teardownTimer = null;
let startTimer = null;    // #21 gated-start backstop; cleared on teardown
let activeRows = [];  // one inner array of windows per row (#28)
let rowEndAt = [];    // projected teardown wall-time per row, index-aligned

// Quit (#31): app.quit() destroys the active flight's windows, whose 'closed'
// handlers would launch the next queued flight mid-quit and keep the app
// alive until the whole queue drained. Queued flights are discarded — the
// Teams DM (if any) already went out at dispatch time and state advanced
// before output, so only the visual is dropped.
let quitting = false;
app.on('before-quit', () => { quitting = true; });

function destroyActiveFlight() {
  clearTimeout(startTimer);
  startTimer = null;
  (activeFlight || []).forEach((win) => { if (!win.isDestroyed()) win.destroy(); });
  activeRows = [];
  rowEndAt = [];
}

function enqueueFlight(event) {
  flightQueue.push(event);
  flyNext();
}

function flyNext() {
  if (quitting || activeFlight || flightQueue.length === 0) return;
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

// AeroSpace (tiling WM, #6): on detection it assigns every new window to the
// FOCUSED monitor's workspace and snaps the frame there — no window style
// escapes its heuristics, and app-side setBounds just gets snapped back.
// The one working recipe: move the window's node to its own monitor via the
// aerospace CLI; AeroSpace then restores the frame to where we put it.
// 'main'/'secondary' covers 1–2 monitor setups. No-op if AeroSpace is absent.
// launchd's default PATH has no Homebrew (#24) — resolve the binary once so
// the LaunchAgent instance finds it; bare fallback keeps genuine-absence ENOENT.
const AEROSPACE_BIN =
  ['/opt/homebrew/bin/aerospace', '/usr/local/bin/aerospace'].find((p) => fs.existsSync(p)) ||
  'aerospace';
let aerospaceMissing = false;
function releaseFromTilingWM(win, isPrimary, attempt = 0, onSettled = () => {}) {
  if (aerospaceMissing || win.isDestroyed()) return onSettled();
  const windowId = win.getMediaSourceId().split(':')[1];
  const target = isPrimary ? 'main' : 'secondary';
  execFile(AEROSPACE_BIN, ['move-node-to-monitor', '--window-id', windowId, target], (err) => {
    if (!err) {
      // AeroSpace just re-homed the window node; make sure the level survived (#12).
      if (!win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver');
      return onSettled();
    }
    if (err.code === 'ENOENT') { aerospaceMissing = true; return onSettled(); }
    // Usually means AeroSpace hasn't detected the window yet — retry briefly.
    if (attempt < 5) return setTimeout(() => releaseFromTilingWM(win, isPrimary, attempt + 1, onSettled), 300);
    onSettled(); // retries exhausted (#21): report so the gate can degrade, don't hang it
  });
}

// Clickable tag (#9) / draggable plane (#11): the renderer arms/disarms its
// own window as the cursor enters/leaves either padded hitbox ('tag-hot' is
// any-hot since #11, and stays on for a whole drag). A click while armed
// opens the ticket. Main opens only the URL it derived itself — the renderer
// sends no payload.
ipcMain.on('tag-hot', (e, hot) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!hot, { forward: true });
});
ipcMain.on('open-ticket', () => {
  if (activeFlightUrl) shell.openExternal(activeFlightUrl);
});
// Drag (#11/#15, row-aware since #28): cancel the teardown on grab; on
// release the renderer sends its row's projected end wall-time (re-seed and
// fast exit both change it — main no longer re-derives the schedule from
// pausedMs). Other rows keep their own schedule — the timer always covers
// the latest-ending row.
ipcMain.on('dragging', (e, { on, endAtMs }) => {
  clearTimeout(teardownTimer);
  teardownTimer = null;
  if (!on) {
    const i = activeRows.findIndex((rowWins) =>
      rowWins.some((w) => !w.isDestroyed() && w.webContents === e.sender));
    if (i !== -1) rowEndAt[i] = endAtMs;
    teardownTimer = setTimeout(destroyActiveFlight, Math.max(...rowEndAt) + 1000 - Date.now());
  }
});
// Relay (#11, row-scoped since #28): deviation state goes to the other
// windows of the sender's ROW — other rows' planes stay on script.
ipcMain.on('flight-state', (e, state) => {
  const row = activeRows.find((rowWins) =>
    rowWins.some((w) => !w.isDestroyed() && w.webContents === e.sender)) || [];
  row.forEach((win) => {
    if (!win.isDestroyed() && win.webContents !== e.sender)
      win.webContents.send('flight-state', state);
  });
});

// Rows engine (#28): displays whose [y, y+height) ranges intersect share a
// horizontal row (union is transitive — a sorted interval-merge sweep). Every
// display lands in exactly one row, so there is no "unpartitionable" case.
function partitionRows(displays) {
  const sorted = [...displays].sort((a, b) => a.bounds.y - b.bounds.y);
  const rows = [];
  for (const d of sorted) {
    const last = rows[rows.length - 1];
    if (last && d.bounds.y < last.yMax) {
      last.displays.push(d);
      last.yMax = Math.max(last.yMax, d.bounds.y + d.bounds.height);
    } else {
      rows.push({ displays: [d], yMax: d.bounds.y + d.bounds.height });
    }
  }
  return rows.map((r) => r.displays);
}

// One continuous flight per row of displays (#28): one overlay per display,
// each rendering its slice of its row's path, all rows synced to a shared
// wall-clock start (issue #6's engine, partitioned per row).
function createFlight(event) {
  activeFlightUrl = event.issueKey && poller.config
    ? `${poller.config.baseUrl}/browse/${event.issueKey}` : '';
  const displays = flyOn === 'main' ? [screen.getPrimaryDisplay()] : screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const createdAt = Date.now();
  // #21: with one physical display AeroSpace has nowhere wrong to put an
  // overlay, so the query-string start stays byte-for-byte. With more, the
  // release (measured 500–725ms, worst case ~1.5s of retries) races the
  // 700ms lead — so the start is withheld and delivered over IPC once every
  // overlay's release has settled.
  const gated = screen.getAllDisplays().length > 1;
  const start = gated ? null : createdAt + START_LEAD_MS;
  let unsettled = 0;
  let onSettled; // undefined when ungated → releaseFromTilingWM's no-op default
  const rows = partitionRows(displays).map((rowDisplays) => {
    const minX = Math.min(...rowDisplays.map((d) => d.bounds.x));
    const maxX = Math.max(...rowDisplays.map((d) => d.bounds.x + d.bounds.width));
    // Row flight line: 32% down the primary if it's in this row (the accepted
    // look, unchanged), else 32% down the row's tallest display.
    const ref = rowDisplays.find((d) => d.id === primary.id) ||
      rowDisplays.reduce((a, b) => (a.bounds.height >= b.bounds.height ? a : b));
    const flyY = Math.round(ref.bounds.y + ref.bounds.height * 0.32);
    // Entry/exit margins mirror plane.html's rig: ~194px offscreen entry
    // (-110% of the ~176px rig); 400px exit so the towed tag (rope 64px + tag
    // ≤312px wide, pivoted 16px in) fully clears the screen before teardown.
    const spanPx = maxX + 400 - (minX - 194);
    const durMs = Math.round((spanPx / SPEED_PX_S) * 1000);
    const leftmost = rowDisplays.reduce((a, b) => (a.bounds.x <= b.bounds.x ? a : b));
    return { displays: rowDisplays, minX, maxX, flyY, durMs, leftmost, ref };
  });
  // Exactly one audio source overall: the leftmost window of the primary's row.
  const primaryRow = rows.find((r) => r.displays.some((d) => d.id === primary.id));
  const audioDisplayId = primaryRow.leftmost.id;
  activeRows = [];
  rowEndAt = [];
  const wins = [];
  rows.forEach((row) => {
    const rowWins = row.displays.map((d) => {
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
        // Without this, macOS constrains a display-sized borderless window into
        // the active screen's visible frame (the menu-bar nudge from the #6
        // gotcha, plus a cross-display jump when another display is active).
        enableLargerThanScreen: true,
        // First click on this never-focused window must reach the page instead
        // of being swallowed as a macOS activation click (#9).
        acceptFirstMouse: true,
        show: false,
        webPreferences: { contextIsolation: true, sandbox: true, autoplayPolicy: 'no-user-gesture-required',
                          preload: path.join(__dirname, 'preload.js') },
      });
      // forward: click-through but the page still gets mousemove, so the
      // renderer can hit-test the tag and arm the window (#9).
      win.setIgnoreMouseEvents(true, { forward: true });
      // false + visibleOnFullScreen: keeps flights visible over full-screen apps
      // WITHOUT canJoinAllSpaces (which puts the window on no particular Space).
      win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
      // Level goes LAST: setVisibleOnAllWorkspaces can reset the macOS window
      // level, which let regular app windows cover the plane (#12). Re-asserted
      // again after show and after the AeroSpace release below.
      win.setAlwaysOnTop(true, 'screen-saver');
      win.loadFile('plane.html', {
        query: {
          type: event.type,
          issueKey: event.issueKey,
          snippet: event.snippet,
          url: activeFlightUrl,
          ...(gated ? {} : { start: String(start) }),
          dur: String(row.durMs),
          minX: String(row.minX),
          maxX: String(row.maxX),
          flyY: String(row.flyY),
          audio: d.id === audioDisplayId ? '1' : '0',
          banner: bannerStyle,
          // Skywriter text bounds (global px): 6%–88% of the row's reference
          // display — the primary on its row (today's exact values), the
          // tallest display elsewhere. Spreading a row's budget across
          // multiple displays stays issue #20's question. main.js computes
          // these because each overlay window only knows its own slice.
          textX0: String(Math.round(row.ref.bounds.x + row.ref.bounds.width * 0.06)),
          textX1: String(Math.round(row.ref.bounds.x + row.ref.bounds.width * 0.88)),
        },
      });
      win.once('ready-to-show', () => {
        win.showInactive();
        win.setAlwaysOnTop(true, 'screen-saver'); // showing can re-stack (#12)
        releaseFromTilingWM(win, d.id === primary.id, 0, onSettled);
      });
      return win;
    });
    activeRows.push(rowWins);
    rowEndAt.push(gated ? Infinity : start + row.durMs); // gated: filled at finalize
    wins.push(...rowWins);
  });
  if (gated) {
    let finalized = false;
    const finalizeStart = () => {
      if (finalized) return;
      finalized = true;
      clearTimeout(startTimer);
      startTimer = null;
      // Never earlier than today's page-load lead; never later than the moment
      // every overlay is confirmed placed (entry is ~194px offscreen, so a
      // few ms of IPC latency never shows on screen).
      const startAt = Math.max(createdAt + START_LEAD_MS, Date.now());
      rowEndAt = rows.map((row) => startAt + row.durMs);
      teardownTimer = setTimeout(destroyActiveFlight, Math.max(...rowEndAt) + 1000 - Date.now());
      wins.forEach((w) => { if (!w.isDestroyed()) w.webContents.send('flight-start', startAt); });
    };
    unsettled = wins.length;
    onSettled = () => { if (--unsettled === 0) finalizeStart(); };
    // Backstop, per the ticket: derived from existing receipts only —
    // START_LEAD_MS (page-load cover) + the full 5×300ms retry span. A window
    // not settled by then is in the will-never-move regime: fly without it.
    startTimer = setTimeout(finalizeStart, START_LEAD_MS + 5 * 300);
  } else {
    teardownTimer = setTimeout(destroyActiveFlight, Math.max(...rowEndAt) + 1000 - Date.now());
  }
  return wins;
}

// One detection engine, two outputs (#7): every event flies (except
// reassigned — the plane deliberately skips that stream, #2) and every event
// DMs. A DM failure is logged and dropped: state has already advanced, same
// "a plane can't fail" model the poller documents — no retry, no re-fly.
// PLANE=0 (#8) turns off the overlay sink the same way an unset
// TEAMS_WEBHOOK_URL turns off the DM sink.
function dispatchEvent(event) {
  if ((poller.config?.plane ?? true) && event.type !== 'reassigned') enqueueFlight(event);
  teams.sendForEvent(event).catch((e) => console.error(`teams sink failed: ${e.message}`));
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
      (await poller.cycle()).forEach(dispatchEvent);
    } catch (e) {
      console.error(`poll cycle failed: ${e.message}`);
    } finally {
      cycleInFlight = false;
    }
  };
  tick();
  setInterval(tick, poller.config.pollSeconds * 1000);
}

// Test flight drives the same dispatchEvent fork a real poll does, so it fires
// BOTH sinks: the plane flies and a real Teams DM goes out. That is deliberate
// (#23, owner decision 2026-08-06) — the two-output design should be
// smoke-testable in one click — and `test: true` makes teams.js mark the DM
// [TEST] so a fake PROJ-142 can't be misread as real Jira activity. Real poller
// events never carry the field, so their DMs are untouched.
// To iterate on overlay visuals without writing to Teams, suppress the sink for
// that run: `TEAMS_WEBHOOK_URL= TEST_FLIGHT=1 npm start` (a shell var beats .env,
// poller.js:33, and an empty webhook URL makes sendForEvent a no-op).
function testFlight() {
  dispatchEvent({
    type: 'assigned',
    issueKey: 'PROJ-142',
    snippet: 'Fix login redirect',
    test: true,
  });
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'Test flight', click: testFlight },
    {
      label: 'Banner style',
      submenu: [
        { label: 'Cargo tag', type: 'radio', checked: bannerStyle === 'cargo',
          click: () => setBannerStyle('cargo') },
        { label: 'Skywriter', type: 'radio', checked: bannerStyle === 'skywriter',
          click: () => setBannerStyle('skywriter') },
      ],
    },
    {
      label: 'Fly on',
      submenu: [
        { label: 'All displays', type: 'radio', checked: flyOn === 'all',
          click: () => setFlyOn('all') },
        { label: 'Main display', type: 'radio', checked: flyOn === 'main',
          click: () => setFlyOn('main') },
      ],
    },
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
