# jiraPlane ✈️

A macOS menu-bar app that flies a little airplane across your screen when something happens
to you in Jira — a ticket gets assigned to you, someone @mentions you, or someone comments
on a ticket you're working on.

Inspired by the viral "airplane flies through your screen 5 minutes before your meetings"
Google Calendar app — same energy, but for Jira.

## How it works

- A tiny Electron app lives in the menu bar and polls the Jira REST API every 60 seconds.
- When an event lands, it opens a transparent, click-through, always-on-top window spanning
  the screen and animates a plane across it with a banner (e.g.
  *"Assigned to you — PROJ-142: Fix login redirect"*), then the window disappears.
- Dedup state, silent first-run seeding, and a flood valve keep it from spamming planes.
- `settings.json` (gitignored) holds user prefs like the banner style — separate from
  `state.json`, so resetting dedup state keeps your choice.

## Setup

```bash
npm install
npm start        # plane icon lands in the menu bar; "Test flight" fires a fake plane
```

Config lives in `.env` (gitignored): `JIRA_BASE_URL`, `JIRA_PAT` (a Data Center personal
access token), `JIRA_USERNAME`, `JIRA_USER_KEY`. Optional extras:

- `TEAMS_WEBHOOK_URL` — a Teams Workflows webhook (the same value JiraAlerts uses). When
  set, every event also lands as a Teams DM; unset means plane only, no DMs.
- `SNIPPET_CHARS` — caps the comment snippet in DMs (default 280).
- `PLANE=0` — turns off the flying plane; events still go to Teams if the webhook
  is set. Unset (the default) means the plane flies.

"Pause polling" in the tray pauses both outputs — no planes and no DMs until resumed.

### Start at login

```bash
./scripts/install-login-launch.sh
```

Starts jiraPlane now, at every login, and again after a crash. Tray "Quit" stays quit.
Uninstall commands are in the script header.

Dev note: the login instance holds the single-instance lock, so a dev `npm start` just
prints "already running" and exits. Tray-Quit the login instance first, then re-run the
installer (or log back in) when you're done.

### Retiring the JiraAlerts timer

Once the DMs come from jiraPlane, the old JiraAlerts local timer is redundant:

```bash
launchctl bootout "gui/$(id -u)/com.jiraalerts.poll"
rm ~/Library/LaunchAgents/com.jiraalerts.poll.plist
```

Reversible — the JiraAlerts repo itself stays untouched; only the local timer stops.

## Status

Bootstrapped 2026-07-23 — build tracked in GitHub Issues.
