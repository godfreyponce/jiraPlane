# Windows test VM

This Mac has no Windows, so the Windows port (#60) flies each ticket in a Parallels VM. A build
session reaches the VM over SSH to start the app, stop it, and read its log. The owner watches the
VM's desktop and flies the plane.

The VM holds no real Jira token and no Teams webhook. #68 is the first ticket that needs them.

## Commands

Run these from Mac Terminal. They need the `windows-vm` alias from Setup step 6.

**Read the Windows version and CPU type.** `BatchMode` makes a password prompt fail instead of wait.

```bash
ssh -o BatchMode=yes windows-vm 'powershell -NoProfile -Command "Get-CimInstance Win32_OperatingSystem | Format-List Caption,Version,OSArchitecture"'
```

**Start the app on the VM's desktop.** Put env vars after the script name as `KEY=VALUE`.

```bash
ssh windows-vm 'powershell -NoProfile -ExecutionPolicy Bypass -File jiraPlane\scripts\windows-vm-start.ps1 TEST_FLIGHT=1 TEAMS_WEBHOOK_URL='
```

The script ends any running copy first, so one app runs at a time. It clears the old log, then starts
a scheduled task named `jiraplane-vm` in the desktop session, because an SSH session has no desktop.
Electron started directly over SSH ran in session 0, and through the task it ran in the signed-in
session. A console window shows on the VM's desktop next to the app.

**A blank value removes the variable.** `TEAMS_WEBHOOK_URL=` on the Mac means "blank, and beats
`.env`". On the VM the same text printed `undefined`, so it does not beat `.env`. This is harmless
while the VM has no `.env`. At #68, a silent test flight must take the webhook out of `.env` first.

**Which values to pass.** The script refuses an argument with no `=`, and a value that holds `"` or
`%`, because `cmd` would break the launch or change the value. Put double quotes around an argument
that holds `&` or a space: `"KEY=a&b c"`. Real secrets go in `.env` only, because the arguments stay
readable in the scheduled task after the app stops.

**Read the log.** It holds the app's console output, and it is plain text.

```bash
ssh windows-vm "type jiraplane-vm.log"
```

**Stop the app.** The task returns to `Ready` on its own.

```bash
ssh windows-vm "taskkill /F /IM electron.exe"
```

**Send this worktree to the VM.** Agents cannot push, so a ticket branch does not reach GitHub before
accept. Run this from the worktree. It copies every tracked and new file and deletes nothing, so a
file deleted on the Mac stays on the VM. A changed `package.json` also needs `npm install` on the VM.

```bash
git ls-files -co --exclude-standard | COPYFILE_DISABLE=1 tar -cf - -T - | ssh windows-vm "tar -xf - -C jiraPlane"
```

**Reset and pull.** A synced tree must be reset before a pull.

```bash
ssh windows-vm "cd jiraPlane && git checkout -- . && git pull"
```

Files sent by the sync stay as untracked files after that reset, and a pull that brings the same
files refuses to overwrite them. The first pull after this ticket's push needs this first. It deletes
every untracked file in the VM's clone. The agents' git hook blocks this command, so the owner runs
it:

```bash
ssh windows-vm "cd jiraPlane && git clean -fd"
```

**After a VM restart.** Windows signed in by itself here, seconds after SSH came back, and the app
then started with no owner step. If nobody is signed in, the start command prints
`Nobody is signed in on the VM desktop. Sign in, then run this again.` and exits 1. Wait a few seconds
and run it again, or sign in on the VM.

## Setup

Each step names the window to use. Keep the VM's IP address and user name out of this repo: they go
in `~/.ssh/config` on the Mac only.

### 1. Mac Terminal: make the SSH key

The key has no passphrase because a build session cannot answer a prompt. Use it for this VM only.

```bash
ssh-keygen -t ed25519 -N '' -C windows-vm -f ~/.ssh/windows-vm
```

### 2. Mac: install Parallels and Windows

1. Install Parallels Desktop. It is paid after the trial.
2. Open it and click **Install Windows** in the prompt. Parallels downloads the Arm image of
   Windows 11 and installs it. Accept the Microsoft license when asked (Parallels KB 125375). This
   rig does not need Windows to be activated.
3. Windows will not install until you sign in to a Parallels account. That window can sit behind
   the others, and the VM shows a play button in the meantime. This account is separate from the
   Windows account in the next item.
4. If Windows asks for an account, use a local account. SSH key sign-in does not work with Entra ID
   accounts. In **Settings**, **Accounts**, **Your info**, it must say **Local account** and
   **Administrator**.
5. Use the VM in a window, not in Coherence.
6. Click the Parallels icon in the Mac menu bar, then **Configure**, **Options**, **Startup and
   Shutdown**. Make sure **Pause Windows after** is clear. It is off by default on a new VM, and a
   paused VM does not answer SSH.

### 3. VM admin PowerShell: install the tools and turn on SSH

Open the Start menu, type `PowerShell`, right-click **Windows PowerShell**, and choose **Run as
administrator**. Paste this line first. It waits for you to paste the key.

```powershell
$key = Read-Host 'Public key'
```

Now click into Mac Terminal and copy the public key. Do the click first, because moving between the
VM and the Mac can overwrite the clipboard.

```bash
pbcopy < ~/.ssh/windows-vm.pub
```

Click into the VM's prompt and right-click to paste. Check that the line starts with `ssh-ed25519`,
and press Enter. An empty prompt that gets an Enter leaves the key blank, so type `$key` and press
Enter to check. It must print the key. If it prints nothing, run the `Read-Host` line again.

Then paste this block into the same PowerShell window. The `--accept` flags accept winget's terms,
because a question from winget would swallow the pasted lines after it. Git and Node go in before
SSH so that `sshd` starts with them on its PATH. Electron's installer needs the Visual C++ runtime,
which a new Windows does not have. The firewall rule first covers Private networks only, and the VM's
Parallels network is Public, so the block widens it.

```powershell
winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements
winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements
winget install --id Microsoft.VCRedist.2015+.arm64 -e --source winget --accept-source-agreements --accept-package-agreements
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
if (!(Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 }
Set-NetFirewallRule -Name OpenSSH-Server-In-TCP -Profile Any
Set-Content -Encoding Ascii -Path "$env:ProgramData\ssh\administrators_authorized_keys" -Value $key
icacls.exe "$env:ProgramData\ssh\administrators_authorized_keys" /inheritance:r /grant "*S-1-5-32-544:F" /grant "SYSTEM:F"
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change monitor-timeout-ac 0
powercfg /change monitor-timeout-dc 0
```

Do not click inside the window while the block runs. A click starts a text selection, the title bar
says `Select`, and the block pauses until you press Esc. The block is done when `icacls` has printed
`Successfully processed 1 files` and the prompt has come back after the `powercfg` lines.

If `winget` is missing, install Git from git-scm.com, Node from nodejs.org, and the Visual C++
Redistributable from Microsoft. Pick the Arm64 installers, and run the block without its `winget`
lines.

### 4. VM Command Prompt, not admin: clone the repo

Use a Command Prompt, not the admin PowerShell. An admin window starts in `C:\WINDOWS\system32`, and
the clone would land there, where the start script does not look. Open the Start menu, type `cmd`,
and click **Command Prompt**, so that it opens normally and sees the new PATH. The prompt must show
your user folder. Check the Node build first:

```bat
node -p process.arch
```

It must print `arm64`. An x64 Node would fetch an x64 Electron, and the VM would test the wrong
binary. If it prints anything else, uninstall Node and install the Arm64 build. Then copy this line
and paste it. The repo is public, so a sign-in prompt means the URL is wrong.

```bat
git clone -c core.autocrlf=false https://github.com/godfreyponce/jiraPlane.git && cd jiraPlane && npm install
```

Git for Windows converts line endings by default, and then one sync marks every file as changed in
`git status`. The cost of turning it off is that a bug caused only by Windows line endings shows up
only on a PC with a normal clone.

If `node_modules\electron\dist` is missing afterwards, run `node node_modules\electron\install.js`
(#53).

### 5. VM Command Prompt: read the address and the user name

```bat
ipconfig
whoami
```

Note the IPv4 address. `whoami` prints `machine\user`, and the part after the backslash is the user
name.

### 6. Mac Terminal: add the SSH alias

Replace `<VM-IP>` and `<VM-USER>` with the values from step 5.

```bash
printf '\nHost windows-vm\n  HostName <VM-IP>\n  User <VM-USER>\n  IdentityFile ~/.ssh/windows-vm\n  IdentitiesOnly yes\n  StrictHostKeyChecking accept-new\n' >> ~/.ssh/config
```

Check it. This must print the Windows version and ask for no password. A warning about a
post-quantum key exchange comes from the VM's SSH server and stops nothing.

```bash
ssh -o BatchMode=yes windows-vm ver
```

### 7. Coworker's PC

Ask the coworker to open **Settings**, **System**, **About**, and read **Version** and **System
type**. Nothing else about the PC is needed.

### If it fails

- `Permission denied (publickey)`: the account is a standard user, or the key file has a bad ACL. A
  standard user's key goes in `%USERPROFILE%\.ssh\authorized_keys` instead. For a bad ACL, run the
  `icacls.exe` line from step 3 again.
- The SSH command times out: the VM is suspended, off, or has a new IP, or the firewall rule does not
  cover the VM's network. Run `ipconfig` on the VM and edit `~/.ssh/config`. Then run the
  `Set-NetFirewallRule` line from step 3 in the admin PowerShell.
- `ERR_DLOPEN_FAILED` from Electron's install, on `extract-zip`: the Visual C++ runtime is missing.
  Run its `winget` line from step 3, then the `install.js` line from step 4.
- `'node' is not recognized` over SSH: `sshd` started before Node. Run `Restart-Service sshd` in the
  admin PowerShell. If that does not help, restart the VM.
