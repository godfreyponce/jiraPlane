const { app, Tray, BrowserWindow, screen, nativeImage, shell, ipcMain } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const poller = require('./poller');
const teams = require('./teams');
const updater = require('./updater');

// Login-launch (#7) means an instance may already be running when the owner
// starts a dev `npm start` — two pollers would double-fly and double-DM.
// Second instance exits immediately; quit the tray instance first for dev.
if (!app.requestSingleInstanceLock()) {
  console.log('jiraPlane already running — exiting this instance');
  app.quit();
}

// Single-screen flight speed at the accepted feel: the #3/#4 design crossed the
// 1512-DIP dev screen plus ~234px of offscreen margins in 10s (12s since #6
// widened the exit margin). Multi-display rows fly faster, not longer (#17).
const SPEED_PX_S = 175;
// Delay between window creation and the synced animation start; overlay pages
// load in ~350ms (measured), this covers cold starts.
const START_LEAD_MS = 700;

let tray = null;
let pollingPaused = false;
let lastPollAt = null; // epoch ms of the last poll cycle that succeeded (#39); null until one does

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
  refreshSurfaces();
}

function setBannerStyle(style) {
  bannerStyle = style;
  saveSettings();
}

function setFlyOn(mode) {
  flyOn = mode;
  saveSettings();
}

// Pause is session-only (#39 keeps it so): not written to settings.json.
function setPollingPaused(paused) {
  pollingPaused = paused;
  refreshSurfaces();
}

// The settings window and the popover show the same state (#29, #39), so a
// change pushes to both.
function refreshSurfaces() {
  pushSettingsState();
  pushPopoverState();
}

const flightQueue = [];
// The last real flights, newest first (#34 replay target, #40 popover list).
// In-memory only; empty until a real event flies. 5 is the ticket's guess.
const RECENT_FLIGHTS_MAX = 5;
const recentFlights = [];
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
app.on('before-quit', () => {
  quitting = true;
  // Electron's Close() refuses a non-closable window and cancels the quit (#54).
  if (popoverWin && !popoverWin.isDestroyed()) popoverWin.setClosable(true);
});

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
  if (quitting) return;
  // A flight that started after the checkout would load the new plane.html
  // under the old main.js (#48): the update waits for the air to clear.
  if (update?.phase === 'restarting' && !activeFlight) return restartApp();
  if (activeFlight || flightQueue.length === 0 || holdingFlights()) return;
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

// Log form of a display (#22): id, size and global origin, enough to rebuild
// a flight's rows from the log alone.
function describeDisplay(d) {
  return `${d.id} ${d.bounds.width}x${d.bounds.height}@${d.bounds.x},${d.bounds.y}`;
}

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
    // Pacing (#17, owner decision 2026-08-10: constant wall-clock): a row flies
    // in the time its reference display alone would take at SPEED_PX_S, so a
    // wider row means a faster plane, not a longer flight. At a flat 175px/s a
    // 1512+1920 row took 23s and the plane reached the second display ~10s after
    // the event. A one-display row keeps its exact duration (ref is that display).
    // Entry/exit margins mirror plane.html's rig: ~194px offscreen entry
    // (-110% of the ~176px rig); 400px exit so the towed tag (rope 64px + tag
    // ≤312px wide, pivoted 16px in) fully clears the screen before teardown.
    const durMs = Math.round(((ref.bounds.width + 194 + 400) / SPEED_PX_S) * 1000);
    const leftmost = rowDisplays.reduce((a, b) => (a.bounds.x <= b.bounds.x ? a : b));
    return { displays: rowDisplays, minX, maxX, flyY, durMs, leftmost, ref };
  });
  // #22: the display set this flight was computed from, so a wrong-looking
  // flight can be explained from the log instead of re-investigated.
  console.log(`${new Date(createdAt).toISOString()} flight: ${event.type} ${event.issueKey || '-'} ` +
    `flyOn=${flyOn} gated=${gated} ` +
    `displays=[${displays.map((d) => describeDisplay(d) + (d.id === primary.id ? ' primary' : '')).join(' + ')}] ` +
    `rows=[${rows.map((r) => `minX=${r.minX} maxX=${r.maxX} flyY=${r.flyY} durMs=${r.durMs}`).join(' | ')}]`);
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
  if ((poller.config?.plane ?? true) && event.type !== 'reassigned') {
    enqueueFlight(event);
    // Recent flights (#34, #40): real assigned/mention/comment only. Test
    // flights and digests fly but never enter the ring. `at` is when the poll
    // found the event; poller events carry no Jira timestamp.
    if (!event.test && ['assigned', 'mention', 'comment'].includes(event.type)) {
      recentFlights.unshift({ ...event, at: Date.now() });
      recentFlights.length = Math.min(recentFlights.length, RECENT_FLIGHTS_MAX);
    }
  }
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
      lastPollAt = Date.now();
      pushPopoverState();
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

// Replay (#34, #40) re-flies a remembered event, picked by popover row index.
// It goes straight to the queue, not through dispatchEvent, so the Teams
// sink never sees it: one DM per real event, however many replays.
function replayFlight(index) {
  const flight = recentFlights[index];
  if (flight) enqueueFlight(flight);
}

// Settings window (#29): a normal titled window, none of the overlay
// machinery. Created on first Settings…, hidden (never destroyed) on close.
const REPO_URL = 'https://github.com/godfreyponce/jiraPlane';
let settingsWin = null;

function settingsState() {
  return { bannerStyle, flyOn, pollingPaused, launchAtLogin: fs.existsSync(LOGIN_PLIST),
           version: app.getVersion() };
}

function pushSettingsState() {
  if (settingsWin && !settingsWin.isDestroyed())
    settingsWin.webContents.send('settings-state', settingsState());
}

function openSettings() {
  if (settingsWin) return showSettings();
  settingsWin = new BrowserWindow({
    width: 680, height: 460, useContentSize: true,
    resizable: false, maximizable: false, fullscreenable: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#222222',
    title: 'jiraPlane Settings',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true,
                      preload: path.join(__dirname, 'preload-settings.js') },
  });
  // Close hides; a real quit (#31's flag) still closes it.
  settingsWin.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    settingsWin.hide();
  });
  settingsWin.webContents.on('did-finish-load', pushSettingsState);
  settingsWin.once('ready-to-show', showSettings);
  settingsWin.loadFile('settings.html');
}

// Every show re-sends state: a window hidden for hours never shows stale values.
function showSettings() {
  pushSettingsState();
  settingsWin.show();
  app.focus({ steal: true }); // tray-only app: bring the window in front of the active app
}

// The page sends intents; main validates and persists, and the resulting
// state comes back through refreshSurfaces. The renderer never touches disk.
ipcMain.on('settings-set', (e, key, value) => {
  if (key === 'bannerStyle' && (value === 'cargo' || value === 'skywriter')) setBannerStyle(value);
  if (key === 'flyOn' && (value === 'all' || value === 'main')) setFlyOn(value);
  if (key === 'pollingPaused' && typeof value === 'boolean') setPollingPaused(value);
  if (key === 'launchAtLogin' && typeof value === 'boolean') setLaunchAtLogin(value);
});
ipcMain.on('settings-test-flight', () => testFlight());
ipcMain.on('settings-open-repo', () => shell.openExternal(REPO_URL));

// Tray popover (#38): the #37 pick (popover-1-menu) as a frameless vibrancy
// panel under the tray icon. Created hidden at launch so a click opens it at
// once; hidden, never destroyed, on dismiss.
const POPOVER_SIZE = { width: 320, height: 232 }; // the empty state with the #58 footer update row; the page fits the height (#39)
const POPOVER_GAP = 5; // px under the icon, as on the #37 stage (24 px menu bar, panel at 29)
let popoverWin = null;
let popoverClock = null; // the 1 s re-send while the panel is open (#39)

// The #37 contract. flights is the ring in contract shape, newest first (#40).
function popoverState() {
  return {
    lastPollAt, pollingPaused,
    flights: recentFlights.map(({ issueKey, snippet, at }) => ({ issueKey, snippet, at })),
    configError: poller.configError && `Polling disabled: ${poller.configError.message}`,
    update,
  };
}

function pushPopoverState() {
  if (popoverWin && !popoverWin.isDestroyed())
    popoverWin.webContents.send('popover-state', popoverState());
}

function createPopover() {
  popoverWin = new BrowserWindow({
    ...POPOVER_SIZE,
    // Non-activating NSPanel: opens on the current Space and over full-screen
    // apps, like a native menu.
    type: 'panel',
    frame: false,
    vibrancy: 'menu',
    visualEffectState: 'active', // keep the blur while the app is inactive, like a menu
    // No AX close button + an accessory app = a popup to AeroSpace 0.21's
    // window filter (isWindowHeuristic, Sources/AppBundle/model/
    // AxUiElementWindowType.swift), so it never adopts the panel and never
    // moves it to its workspace's monitor (#54). The #38 release is not the
    // answer: it made the panel blur and hide.
    resizable: false, movable: false, minimizable: false, maximizable: false, closable: false,
    fullscreenable: false,
    skipTaskbar: true,
    acceptFirstMouse: true, // the first click picks a row instead of focusing (#9)
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true,
                      preload: path.join(__dirname, 'preload-popover.js') },
  });
  popoverWin.on('blur', () => popoverWin.hide());
  // While the panel is open, main re-sends the state once a second so the
  // relative time counts up; the page runs no timer (#39). 1 s is the finest
  // unit the page's ago() prints.
  popoverWin.on('show', () => { popoverClock = setInterval(pushPopoverState, 1000); });
  popoverWin.on('hide', () => clearInterval(popoverClock));
  popoverWin.webContents.on('did-finish-load', pushPopoverState);
  // Close hides; a real quit (#31's flag) still closes it.
  popoverWin.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    popoverWin.hide();
  });
  // A new Tray reports placeholder bounds (y = display bottom) for its first
  // ~130-300 ms (measured 2026-10-13), so the hook waits 1 s (about 3x that, a
  // margin guess) before reading them.
  if (process.env.OPEN_POPOVER === '1')
    popoverWin.once('ready-to-show', () => setTimeout(() => togglePopover(tray.getBounds()), 1000));
  popoverWin.loadFile('popover.html');
}

function togglePopover(trayBounds) {
  if (popoverWin.isVisible()) return popoverWin.hide();
  const display = screen.getDisplayMatching(trayBounds);
  const { workArea } = display;
  // Left edge under the icon's left edge (NSMenu-style), pulled left if the
  // panel would run off the display.
  const x = Math.round(Math.min(trayBounds.x, workArea.x + workArea.width - POPOVER_SIZE.width));
  const y = Math.round(trayBounds.y + trayBounds.height + POPOVER_GAP);
  popoverWin.setPosition(x, y);
  // #22 habit: a panel in the wrong place can be explained from the log.
  console.log(`${new Date().toISOString()} popover: tray=${trayBounds.x},${trayBounds.y} ` +
    `${trayBounds.width}x${trayBounds.height} at=${x},${y} display=${describeDisplay(display)}`);
  // A panel hidden for hours opens on the state as of now, not its last push
  // (#39). Sent before show so the first frame is current.
  pushPopoverState();
  popoverWin.show();
  // Below the overlays' 'screen-saver': a flight always renders above the
  // popover. After show, which can re-stack (#12).
  popoverWin.setAlwaysOnTop(true, 'pop-up-menu');
}

// Popover rows act like menu items: the panel closes, then the action runs.
ipcMain.on('popover-test-flight', () => { popoverWin.hide(); testFlight(); });
// A row is a menu item: the panel closes, then the flight replays (#40). The
// index is the row's position in the last pushed list; anything else is ignored.
ipcMain.on('popover-replay', (e, index) => {
  if (!Number.isInteger(index) || !recentFlights[index]) return;
  popoverWin.hide();
  replayFlight(index);
});
ipcMain.on('popover-open-settings', () => { popoverWin.hide(); openSettings(); });
ipcMain.on('popover-quit', () => app.quit());
ipcMain.on('popover-set-paused', (e, paused) => {
  if (typeof paused === 'boolean') setPollingPaused(paused);
});
// The page sends its panel height after each render (#39). A config error
// wraps the status to two lines, taller than the 232 px empty state. setSize
// keeps the top edge, so the panel grows downward from the menu bar.
ipcMain.on('popover-fit', (e, height) => {
  const [width, current] = popoverWin.getSize();
  if (Number.isInteger(height) && height !== current) popoverWin.setSize(width, height);
});
ipcMain.on('popover-update', () => runUpdate()); // the panel stays open to show the swoosh (#58)

// Update check (#48): a new vX.Y.Z tag shows in the popover; one click checks
// it out, runs npm install, and restarts once no plane is in the air.
const UPDATE_CHECK_MS = 24 * 60 * 60 * 1000; // "once a day" is #48's guess
// popover.html finishSwoosh(): lit, then park (#58), then 500 ms parked (a guess) before the restart.
const FINISH_MS = 350 + 600 + 500 + 500;
// The popover contract field (#48), always set since #57: the panel always shows a status.
// No ref since #58: the popover shows the tag only; check() still returns ref for the log.
let update = { phase: 'checking', tag: '', detail: '', checkedAt: null };
let updateBusy = false;   // one check at a time
let restartStarted = false;

function setUpdate(next) {
  update = next;
  pushPopoverState();
}

function holdingFlights() {
  return Boolean(update) && ['installing', 'restarting'].includes(update.phase);
}

async function checkForUpdate() {
  if (updateBusy || holdingFlights() || update?.phase === 'failed') return;
  updateBusy = true;
  try {
    const { tag, relation, ref } = await updater.check(__dirname);
    const reason = relation === 'behind' && await updater.blocker(__dirname);
    if (holdingFlights()) return; // the click landed while this check ran
    const phase = relation === 'on' ? 'current' : relation === 'ahead' ? 'ahead'
      : reason ? 'blocked' : 'available';
    console.log(`${new Date().toISOString()} update: check: ` +
      `${phase === 'current' ? `${tag} current` : phase === 'ahead' ? `${ref} ahead of ${tag}`
        : phase === 'blocked' ? `${tag} blocked (${reason})` : `${tag} available`}`);
    setUpdate({ phase, tag, detail: reason || '', checkedAt: Date.now() });
  } catch (e) {
    console.log(`${new Date().toISOString()} update: check failed: ${e.message}`);
    // Only a status line gives way: a newer tag already fetched keeps its line and
    // button, and an update under way or failed keeps its own line.
    if (['checking', 'current', 'ahead', 'check-failed'].includes(update.phase))
      setUpdate({ phase: 'check-failed', tag: '', detail: '', checkedAt: update.checkedAt });
  } finally {
    updateBusy = false;
  }
}

async function runUpdate() {
  if (update?.phase !== 'available') return;
  const { tag } = update;
  // Installing first: it holds flights and turns a second click into a no-op.
  setUpdate({ ...update, phase: 'installing', detail: '' });
  try {
    // Edits made since the check are refused, never touched.
    const reason = await updater.blocker(__dirname);
    if (reason) setUpdate({ ...update, phase: 'blocked', detail: reason });
    else {
      await updater.install(__dirname, tag);
      setUpdate({ ...update, phase: 'restarting', detail: '' });
      await new Promise((done) => setTimeout(done, FINISH_MS)); // the popover's finish plays out first
    }
  } catch (e) {
    console.error(`${new Date().toISOString()} update: ${tag} failed: ${e.message}`);
    setUpdate({ ...update, phase: 'failed', detail: e.message });
  }
  flyNext();
}

// The login job exits non-zero so KeepAlive (SuccessfulExit=false) starts it
// again under its own label; a dev run relaunches itself.
function restartApp() {
  if (restartStarted) return;
  restartStarted = true;
  withLoginJob((notLoaded, isLoginJob) => {
    console.log(`${new Date().toISOString()} update: restarting as ` +
      `${isLoginJob ? 'login job (exit 1)' : 'dev run (relaunch)'}`);
    if (isLoginJob) return app.exit(1);
    app.relaunch();
    app.exit(0);
  });
}

// Launch at login (#29) wraps the #7 LaunchAgent: on = the plist exists.
const LOGIN_PLIST = path.join(app.getPath('home'), 'Library', 'LaunchAgents', 'com.jiraplane.app.plist');
const LOGIN_SERVICE = `gui/${process.getuid()}/com.jiraplane.app`;
const INSTALLER = path.join(__dirname, 'scripts', 'install-login-launch.sh');
let loginToggleBusy = false;

function setLaunchAtLogin(on) {
  if (loginToggleBusy || on === fs.existsSync(LOGIN_PLIST)) return pushSettingsState();
  loginToggleBusy = true;
  const done = (err) => {
    if (err) console.error(`launch at login: ${err.message}`);
    loginToggleBusy = false;
    pushSettingsState();
  };
  withLoginJob((notLoaded, isLoginJob) => {
    // #7 gotcha: if this process IS the login job, bootout would SIGTERM it
    // and leave zero instances. Only the plist changes; the loaded job stays
    // until logout, so a crash before then still restarts the app.
    if (on) {
      // The full install bootstraps the job: launchd's new instance loses the
      // single-instance lock to this one and exits 0, and KeepAlive
      // (SuccessfulExit=false) does not restart a clean exit.
      execFile('/bin/sh', [INSTALLER, ...(isLoginJob ? ['--write-only'] : [])], done);
    } else {
      fs.rmSync(LOGIN_PLIST, { force: true });
      if (notLoaded || isLoginJob) return done();
      execFile('/bin/launchctl', ['bootout', LOGIN_SERVICE], done);
    }
  });
}

// isLoginJob: this process is the loaded com.jiraplane.app job (#29's test).
function withLoginJob(cb) {
  // launchctl print fails (exit 113) when the job is not loaded.
  execFile('/bin/launchctl', ['print', LOGIN_SERVICE], (notLoaded, stdout) => {
    cb(notLoaded, !notLoaded && new RegExp(`^\\s*pid = ${process.pid}$`, 'm').test(stdout));
  });
}

app.whenReady().then(() => {
  app.dock.hide();
  const icon = nativeImage.createFromPath(
    path.join(__dirname, 'assets', 'iconTemplate.png')
  );
  tray = new Tray(icon);
  tray.setToolTip('jiraPlane');
  // Otherwise a fast second click arrives as 'double-click', not 'click', and
  // the panel ignores it.
  tray.setIgnoreDoubleClickEvents(true);
  // Either click toggles the popover (#38, #41): the tray has one surface.
  // Never setContextMenu: on macOS a tray context menu opens on left click
  // too, and 'click' is never emitted.
  tray.on('click', (e, bounds) => togglePopover(bounds));
  tray.on('right-click', (e, bounds) => togglePopover(bounds));
  createPopover();
  // Display changes (#22): a flight keeps the display set it was created
  // with. Rebuilding overlays mid-flight would drop the #11/#15 drag state,
  // and a display that wakes mid-flight is in the next flight. Logged only.
  const logDisplay = (what, d) => console.log(`${new Date().toISOString()} display: ${what} ` +
    `${describeDisplay(d)}${activeFlight ? ' mid-flight' : ''}`);
  screen.on('display-added', (e, d) => logDisplay('added', d));
  screen.on('display-removed', (e, d) => logDisplay('removed', d));
  // A flight reads only bounds; workArea changes with the Dock and menu bar.
  screen.on('display-metrics-changed', (e, d, changed) => {
    if (changed.includes('bounds')) logDisplay('bounds', d);
  });
  startPolling();
  // UPDATE_NOW=1 clicks Update as soon as the launch check offers one (#48).
  checkForUpdate().then(() => { if (process.env.UPDATE_NOW === '1') runUpdate(); });
  setInterval(checkForUpdate, UPDATE_CHECK_MS);
  if (process.env.TEST_FLIGHT === '1') testFlight();
  if (process.env.OPEN_SETTINGS === '1') openSettings();
});

// Menu-bar app: stay alive with no windows open.
app.on('window-all-closed', () => {});
