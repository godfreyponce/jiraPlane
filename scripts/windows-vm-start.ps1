$ErrorActionPreference = 'Stop'
foreach ($arg in $args) {
  if ($arg -notmatch '^[A-Za-z0-9_]+=[^"%]*$') {
    Write-Output 'Each argument must be KEY=VALUE, and a value cannot hold a double quote or a percent sign.'
    exit 1
  }
}
if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) {
  Write-Output 'Nobody is signed in on the VM desktop. Sign in, then run this again.'
  exit 1
}
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force -PassThru | Wait-Process
$log = "$env:USERPROFILE\jiraplane-vm.log"
Remove-Item $log -ErrorAction SilentlyContinue
$sets = ($args | ForEach-Object { "set `"$_`"&& " }) -join ''
# An SSH session runs in session 0, which has no desktop. A task with an
# interactive logon runs in the signed-in user's desktop session instead.
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -WorkingDirectory "$env:USERPROFILE\jiraPlane" `
  -Argument "/c `"$($sets)npm start > `"$log`" 2>&1`""
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0
Register-ScheduledTask jiraplane-vm -Action $action -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask jiraplane-vm
