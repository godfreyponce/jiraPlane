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

## Status

Bootstrapped 2026-07-23 — build tracked in GitHub Issues. Run instructions land with issue #1.
