# Setting this up for yourself

This walks you from zero → a paper plane flying across your screen when Jira
activity involves you. You need a Mac, a Jira Data Center account, Node.js, and
about 15 to 30 mins if you also want Teams DMs. Nothing here requires Jira
admin rights.

Each person runs their own copy: so your clone, your Jira token, optionally your
own Teams webhook. No shared infrastructure; nobody can see anyone else's tickets.

## 1. Clone and install

```bash
git clone https://github.com/godfreyponce/jiraPlane.git
cd jiraPlane
npm install
```

## 2. Create a Jira Personal Access Token

Jira → your avatar → **Profile → Personal Access Tokens → Create token**. Name
it, set an expiry, copy the token. Write the expiry date somewhere you'll remember it because when the token dies, the app goes silent with no error you'll ever notice.

## 3. Find your username and user key

Your username is what you log in with. Your user key is internal and non-obvious; the easiest way
to get it is to ask Jira who you are. Replace both ALL-CAPS placeholders. `YOUR-JIRA-HOST` is the
host you reach Jira at in the browser, no `https://` and no trailing slash:

```bash
curl -sS -i -H "Authorization: Bearer YOUR-PAT" \
  'https://YOUR-JIRA-HOST/rest/api/2/myself' \
  | tr ',' '\n' | grep -Ei '^HTTP/|^x-ausername:|"(name|key)":' | head -4
```

Four lines back means it worked:

```
HTTP/1.1 200
X-AUSERNAME: your-username
"key":"JIRAUSER12345"
"name":"your-username"
```

`name` is your `JIRA_USERNAME` and `key` is your `JIRA_USER_KEY`. Both matter for @mention
detection — get either one wrong and mentions silently stop matching. (If your Jira speaks HTTP/2
the first line reads `HTTP/2 200` and the header name comes back lowercase as `x-ausername:`. Same
two lines, different spelling.)

Anything else is one of three failures, and they look different on purpose:

- **`401` with `x-ausername: anonymous`.** You reached Jira and it rejected your token. Go back to
  step 2.
- **`curl: (6) Could not resolve host` or `curl: (7) Failed to connect`.** You never reached Jira
  at all. The host is wrong, not the token.
- **`404`.** You reached a web server but not Jira's API. Check the host, including any path your
  Jira sits under; some installs live at `https://host/jira`.

If none of those match what you got, delete everything from `| tr` onward to see the raw response.

## 4. Pick your outputs

The app detects Jira events once and can deliver them two ways. Any combination
works:

| You want | `.env` setup |
|---|---|
| Plane only (default) | leave both optional lines alone |
| Plane + Teams DMs | set `TEAMS_WEBHOOK_URL` |
| Teams DMs only | set `TEAMS_WEBHOOK_URL`, add `PLANE=0` |

For the Teams webhook, build the Power Automate flow described in
[JiraAlerts' onboarding, step 4](https://github.com/godfreyponce/Jira-Alerts/blob/main/docs/ONBOARDING.md#4-build-the-power-automate-flow)
— jiraPlane sends the identical six-field payload, so the same flow serves
both. If you already run JiraAlerts, reuse your existing webhook URL as-is.

## 5. Configure and first flight

```bash
cp .env.example .env      # fill in the values from steps 2-4
npm start
```

A plane icon lands in the menu bar. Click it → **Test flight** to see the plane
(and, if you set the webhook, a test DM). The first poll cycle seeds silently —
it records what it currently sees without notifying, so you don't get flooded
with backlog. To re-seed from scratch later, delete `state.json`.

## 6. Start at login

```bash
./scripts/install-login-launch.sh
```

Starts jiraPlane now, at every login, and again after a crash. Tray **Quit**
stays quit until next login. Uninstall commands are in the script header.

## Known quirks

- **One instance at a time.** The login instance holds a lock; a second
  `npm start` prints "already running" and exits. Tray-Quit the login instance
  first if you want to run from a terminal.
- **When the PAT expires, everything goes quiet with no warning.** Set a
  calendar reminder for the expiry date from step 2.
- **No polling while your Mac sleeps.** On wake the next cycle catches up on
  assignment changes fully; comments older than 30 minutes are dropped by design.
- **Pause polling** in the tray pauses both outputs — no planes and no DMs
  until resumed.
- A DM failure is logged and dropped — there's no retry queue.
