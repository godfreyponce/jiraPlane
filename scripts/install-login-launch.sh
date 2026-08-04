#!/bin/sh
# Installs a launchd LaunchAgent so jiraPlane starts at login and restarts
# after a crash — the always-on guarantee that lets the JiraAlerts timer
# retire (#7). Tray "Quit" (clean exit) stays quit. Re-run after moving the
# repo. Uninstall:
#   launchctl bootout "gui/$(id -u)" ~/Library/LaunchAgents/com.jiraplane.app.plist
#   rm ~/Library/LaunchAgents/com.jiraplane.app.plist
set -e

REPO="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON="$REPO/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
PLIST="$HOME/Library/LaunchAgents/com.jiraplane.app.plist"

if [ ! -x "$ELECTRON" ]; then
  echo "Electron binary not found at $ELECTRON — run 'npm install' first" >&2
  exit 1
fi

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jiraplane.app</string>
  <key>ProgramArguments</key>
  <array>
    <string>$ELECTRON</string>
    <string>$REPO</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed com.jiraplane.app — jiraPlane is now running and will start at every login."
