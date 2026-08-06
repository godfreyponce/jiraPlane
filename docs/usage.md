# Day-to-day usage

Setup from zero is [ONBOARDING.md](ONBOARDING.md). This page is everything after
that: the tray, the knobs, and the two files the app writes.

## The tray

The plane icon in the menu bar is the whole UI:

- **Test flight** fires a fake plane (PROJ-142, "Fix login redirect") without
  touching Jira. If a Teams webhook is set, it sends a [TEST]-marked DM too.
- **Banner style** picks Cargo tag or Skywriter. The choice persists across
  restarts.
- **Pause polling** pauses both outputs. No planes and no DMs until resumed.
- **Quit** quits, and stays quit even if you installed the login launcher.

`TEST_FLIGHT=1 npm start` fires a test flight on launch, useful when you're
poking at plane.html.

## Configuration

Everything lives in `.env` (gitignored). Four values are required:

| Variable | What it is |
|---|---|
| `JIRA_BASE_URL` | your Jira Data Center URL |
| `JIRA_PAT` | a personal access token, sent as a Bearer header |
| `JIRA_USERNAME` | what you log in with |
| `JIRA_USER_KEY` | Jira's internal key for you, like `JIRAUSER12345` |

ONBOARDING.md shows where each one comes from, including the
`/rest/api/2/myself` trick for the user key.

Outputs are independent, any combination works:

| You want | `.env` setup |
|---|---|
| Plane only (default) | nothing extra |
| Plane + Teams DMs | set `TEAMS_WEBHOOK_URL` |
| Teams DMs only | set `TEAMS_WEBHOOK_URL`, add `PLANE=0` |

Optional tuning, defaults in parentheses: `POLL_SECONDS` (60),
`LOOKBACK_MINUTES` (30), `COMMENTS_PER_ISSUE` (20), `PRUNE_DAYS` (30),
`MAX_EVENTS_PER_CYCLE` (3, the flood valve), `SNIPPET_CHARS` (280, caps the
comment snippet in DMs).

## The two state files

- `state.json` is the dedup memory: what the poller has already seen. Delete it
  to re-seed from scratch; the next run seeds silently, no backlog flood.
- `settings.json` holds your prefs, currently the banner style. It is separate
  from state.json on purpose: resetting dedup keeps your choice.

Both are gitignored.

## Running it

One instance at a time. A second `npm start` prints "already running" and exits.
That bites in exactly one way: if the login launcher is installed, it holds the
lock, so tray-Quit the login instance before running from a terminal, and re-run
the installer (or log back in) when you're done.

```bash
./scripts/install-login-launch.sh
```

Starts the app now, at every login, and again after a crash. Tray Quit stays
quit until next login. Uninstall commands are in the script header.

## Retiring the JiraAlerts timer

Once your DMs come from jiraPlane, the old
[Jira-Alerts](https://github.com/godfreyponce/Jira-Alerts) local timer is
redundant:

```bash
launchctl bootout "gui/$(id -u)/com.jiraalerts.poll"
rm ~/Library/LaunchAgents/com.jiraalerts.poll.plist
```

Reversible. The JiraAlerts repo itself stays untouched; only the local timer
stops.
