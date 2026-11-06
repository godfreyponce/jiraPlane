# Setting this up for yourself

This walks you from zero → a paper plane flying across your screen when Jira
activity involves you. You need a Mac or a Windows PC, a Jira Data Center account,
Node.js, and about 15 to 30 mins if you also want Teams DMs. Nothing here requires
Jira admin rights. On Windows, do the steps in the [Windows](#windows) section at
the end instead.

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
(and, if you set the webhook, a test DM). When a new version is tagged, the same panel
shows `vX.Y.Z available` with an **Update** button: one click installs it and restarts
the app once no plane is flying. The first poll cycle seeds silently —
it records what it currently sees without notifying, so you don't get flooded
with backlog. To re-seed from scratch later, delete `state.json`.

## 6. Start at login

```bash
./scripts/install-login-launch.sh
```

Starts jiraPlane now, at every login, and again after a crash. Tray **Quit**
stays quit until next login. Uninstall commands are in the script header.

The login instance writes its console output to `~/Library/Logs/jiraplane.log`.
If you installed before this log existed, run the script again to get it. To watch it:

```bash
tail -f ~/Library/Logs/jiraplane.log
```

The file is never rotated, and it stays small. A poll cycle with nothing new writes
nothing. Each flight writes about 200 bytes, the update check about 50 bytes a day,
and each panel open about 100 bytes. At about 12 events a month and a few panel
opens a day, that is under 1 KB a day. If Jira is unreachable or your token has
expired, the app writes one failure line of up to 60 bytes each minute, about
85 KB a day.

## 7. Update

The app checks for a new version at launch and once a day. When one is tagged, the
panel (click the plane icon) shows `vX.Y.Z available` and an **Update** button. Click
it. The app installs the new version and restarts itself once no plane is flying.
Nothing changes until you click.

Use the steps below instead when the panel says `Can't update` (it names why), when it
says `Update failed`, or when your copy is older than the Update button.

```bash
git fetch --tags
```

You should see a list of new tags, or nothing if there are none.

```bash
git checkout "$(git tag -l 'v*' --sort=-v:refname | head -1)"
```

You should see `HEAD is now at …`. A note about "detached HEAD" is expected: the app runs
from a tagged version, not from a branch.

If it stops with `Your local changes to the following files would be overwritten by
checkout` and names `package-lock.json`, an earlier `npm install` edited that file. Throw
the edit away, then run the `git checkout` line above again.

```bash
git checkout package-lock.json
```

You should see `Updated 1 path from the index`.

```bash
npm install
```

You should see `up to date` or `added N packages`, and no errors.

Now restart the instance that is running. Which command depends on how you started it.

**Started from a terminal with `npm start`:** press Ctrl-C in that terminal. The plane
icon leaves the menu bar. Then start it again.

```bash
npm start
```

You should see the plane icon come back in the menu bar.

**Started at login (step 6):** re-run the installer. It stops the running login instance
and starts a fresh one on the code now on disk. It also works if you quit the login
instance earlier and nothing is running.

```bash
./scripts/install-login-launch.sh
```

You should see `Installed com.jiraplane.app — jiraPlane is now running and will start at
every login.` and the plane icon leave the menu bar and come back.

If a terminal `npm start` is running at the same time, Ctrl-C it first. Otherwise the new
login instance finds the lock held, exits, and launchd does not start it again.

To check the restart worked, right-click the plane icon. The popover opens. A copy
still running code from before the popover (#41) shows a plain menu instead.

## Known quirks

- **One instance at a time.** The login instance holds a lock; a second
  `npm start` prints "already running" and exits. Tray-Quit the login instance
  first if you want to run from a terminal.
- **When the PAT expires, everything goes quiet with no warning.** Set a
  calendar reminder for the expiry date from step 2.
- **No polling while your Mac sleeps.** On wake the next cycle catches up on
  assignment changes fully; comments older than 30 minutes are dropped by design.
- **Pause** (the switch in the tray panel, or *Pause polling* in Settings…)
  pauses both outputs — no planes and no DMs until resumed.
- A DM failure is logged and dropped — there's no retry queue.

## Windows

Run every command in this section in Windows PowerShell. Open the Start menu, type
`PowerShell`, and open **Windows PowerShell**. Do not run it as administrator.

### W1. Install

Check your PC type in **Settings → System → About → System type**. It says
"x64-based" or "ARM-based". Then install Git, Node.js LTS, and the Microsoft Visual
C++ runtime, which Electron's installer needs.

```powershell
winget install --id Git.Git -e --source winget
winget install --id OpenJS.NodeJS.LTS -e --source winget
winget install --id Microsoft.VCRedist.2015+.x64 -e --source winget
```

On an ARM-based PC, change `.x64` to `.arm64` on the last line. Windows may ask you to
allow changes. If it asks for an administrator password you do not have, ask IT to
install Git, Node.js LTS, and the Visual C++ Redistributable, then go on with the
clone. When all three are installed, close PowerShell and open a new window so it
finds `git` and `node`.

Clone the repo and install it.

```powershell
git clone https://github.com/godfreyponce/jiraPlane.git
cd jiraPlane
npm.cmd install
```

You should see `added N packages` and no errors. Use `npm.cmd`, not `npm`. Windows
blocks plain `npm` in PowerShell by default with `running scripts is disabled on this
system`, and `npm.cmd` is the same command without that block.

If `node_modules\electron\dist` is missing right after the install, that is normal.
Electron downloads it the first time the app starts. If your first `npm.cmd start`
(step W3) stops with `ERR_DLOPEN_FAILED` and names `extract-zip`, the Visual C++
runtime is missing. Run its `winget` line above, then run this.

```powershell
node node_modules\electron\install.js
```

### W2. Get your Jira values

Create a Jira Personal Access Token the same way as in
[step 2](#2-create-a-jira-personal-access-token).

Find your username and user key with the command below. Replace both ALL-CAPS
placeholders the same way as in [step 3](#3-find-your-username-and-user-key). Type
`curl.exe`, not `curl`, because `curl` is a different command in Windows PowerShell.

```powershell
(curl.exe -sS -i -H "Authorization: Bearer YOUR-PAT" "https://YOUR-JIRA-HOST/rest/api/2/myself") -split ',' | Select-String '^HTTP/','^x-ausername:','"(name|key)":' | Select-Object -First 4
```

You should see the same four lines as in step 3. Any other output is one of the three
failures listed there. To see the raw response, run only the part inside the first
parentheses.

Pick your outputs the same way as in [step 4](#4-pick-your-outputs).

### W3. Configure and first flight

Create your `.env` and open it in Notepad.

```powershell
Copy-Item .env.example .env
notepad .env
```

Fill in the values from step W2, save, and close Notepad. Then start the app.

```powershell
npm.cmd start
```

The plane icon appears in the corner of the taskbar, next to the clock. A new icon may
hide behind the `^` arrow. Drag it onto the taskbar to keep it in view. Left click or
right click the icon to open the panel next to the taskbar. Click **Test flight** to
see the plane. If you set the webhook, you also get a test DM.

Closing the PowerShell window stops the app. The first poll cycle seeds silently, the
same as in [step 5](#5-configure-and-first-flight).

### W4. Start at login

Open the panel and click **Settings…**. Open **General** and switch **Launch at
login** on. The app starts at your next sign-in, not now.

The login start writes its output to `%APPDATA%\jiraplane\logs\jiraplane.log`. Nothing
rotates the file, and it stays small. [Step 6](#6-start-at-login) has the sizes. To
watch it, run this.

```powershell
Get-Content -Wait "$env:APPDATA\jiraplane\logs\jiraplane.log"
```

The app does not restart after a crash. Start it again with `npm.cmd start`, or sign
out and back in. If you move the clone to another folder, switch **Launch at login**
on again. Windows' **Startup apps** page lists the app as `Electron`.

### W5. Update

Windows has no **Update** button yet. When a new version is tagged, the panel shows
`vX.Y.Z available` and points you here.

Click **Quit** in the panel first. Windows locks the app's files while it runs, so the
install below can fail part way if the app is still open.

Fetch the tags.

```powershell
git fetch --tags
```

You should see a list of new tags, or nothing if there are none. Check out the newest
one.

```powershell
git checkout "$(git tag -l 'v*' --sort=-v:refname | Select-Object -First 1)"
```

You should see `HEAD is now at …`. A note about "detached HEAD" is expected, because
the app runs from a tagged version, not from a branch.

If the checkout stops with `Your local changes to the following files would be
overwritten by checkout` and names `package-lock.json`, an earlier install edited that
file. Throw the edit away.

```powershell
git checkout package-lock.json
```

You should see `Updated 1 path from the index`. Then run the `git checkout` line above
again.

Install the new version.

```powershell
npm.cmd install
```

You should see `up to date` or `added N packages`, and no errors.

Start the app again with `npm.cmd start`, even if it starts at login. An update can
bring a new Electron version, and only `npm.cmd start` downloads it. The sign-in start
does not, so after such an update a sign-in alone starts nothing.

### Windows quirks

Run one instance at a time. A second `npm.cmd start` prints `already running` and
exits. The app does not poll while your PC sleeps, and it catches up by the same rules
as on the Mac. It does not restart after a crash, even when it starts at login, so
start it again by hand. The tray icon can hide behind the `^` arrow, so a start that
looks like it did nothing may have worked. PAT expiry, **Pause**, and DM failures work
the same as in [Known quirks](#known-quirks).
