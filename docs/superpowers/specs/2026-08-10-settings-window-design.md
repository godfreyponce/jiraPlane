# jiraPlane — Settings window (Alcove-style) + slim tray menu

**Date:** 2026-08-10
**Status:** Approved by owner (slim menu + Settings…, General/Appearance/About sections)
**Depends on:** #10 (settings.json, banner styles), #7 (LaunchAgent installer),
flight-display-targeting spec of the same date (the "Fly on" row)
**Reference:** Alcove's settings window (owner-provided screenshot) — sidebar left,
toggle-card rows right, dark macOS-settings look. The owner likes the current tray
logo; what changes is what opens when you click it.

## What this is

Replace the everything-in-a-dropdown tray menu with a proper settings window. The tray
menu slims to quick actions; every preference moves into a new `settings.html` window
styled after Alcove.

## Scope decisions made with the owner

- **Tray menu becomes:** Test flight · Settings… · Quit. Banner style and Pause
  polling leave the menu and live only in the window. (Owner chose slim-menu over
  Alcove's click-opens-window-directly.)
- **Sections:** General, Appearance, About. No more for v1.
- **Cut-line, pre-agreed:** the launch-at-login toggle is the riskiest row (installer
  script, single-instance lock). If the ticket won't fit one build session, that
  toggle is what drops — the `./scripts/install-login-launch.sh` path keeps working
  standalone.
- **Design-directions habit applies** (#3/#4 precedent): 2–3 rough standalone HTML
  variants in `design-directions/` first, owner picks, then the plan wires the winner.
  Window dimensions come out of that pick — not invented up front.

## Architecture note: a second visual file

The standing rule is "all visuals live in one self-contained plane.html". That rule is
about *flight* visuals and stands unchanged. The settings window is a separate concern
and gets the same treatment as a rule, not an exception: one self-contained
`settings.html`, so UI iteration on settings swaps exactly one file too.

## Window

Standard titled BrowserWindow (traffic lights, not resizable) — this is a normal app
window, none of the overlay machinery (no screen-saver level, no AeroSpace release, no
click-through). Singleton: Settings… focuses the existing window if open. Closing hides
the window; the app stays a tray app (no dock icon change).

## Sections

**General**
- Test flight — button, same handler as the tray item.
- Pause polling — toggle, replaces the menu item; pauses both sinks (plane + Teams DM),
  same semantics as today.
- Fly on — All displays / Main display, wired to the `flyOn` setting from the
  flight-display-targeting ticket. If that ticket hasn't landed when this builds, the
  row ships disabled with the same two options visible.
- Launch at login — toggle reflecting whether the `com.jiraplane.app` LaunchAgent is
  installed. On: run the installer logic. Off: `launchctl bootout` + remove the plist.
  The plan must handle the #7 gotcha: the login instance holds the single-instance
  lock, so toggling from a dev instance and from the login instance are different
  situations and the toggle must not strand the user with zero or two instances.

**Appearance**
- Banner style — the #10 picker (cargo tag / skywriter) as selectable cards, with
  small static previews if the design-directions round produces good ones cheaply;
  plain labeled cards otherwise.

**About**
- Version (from package.json), link to the GitHub repo.

## Wiring

- `settings.html` talks to main over IPC (preload-exposed, same contextIsolation
  setup as plane.html's preload): read current settings/state on open, push changes
  as they happen. All persistence stays in main.js writing `settings.json` — the
  renderer never touches disk.
- Tray menu no longer needs the rebuild-on-change radio dance for banner style; the
  menu shrinks to three static items.

## Verification (no test suite — run it)

- Open Settings from the tray; flip every control; confirm each takes effect (banner
  style on next test flight, pause stops both sinks, fly-on changes next flight's
  window set) and survives an app restart via `settings.json`.
- Launch-at-login toggle: verify from a dev instance and from the login instance;
  end state after each toggle cycle is exactly one running instance and the plist
  present/absent as shown.
- Close and reopen the window: singleton behavior, state re-read fresh.
