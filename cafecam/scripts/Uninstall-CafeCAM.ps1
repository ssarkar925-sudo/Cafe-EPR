[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList @("-NoLogo","-NoProfile","-ExecutionPolicy","Bypass","-File",$PSCommandPath) -Wait
  exit $LASTEXITCODE
}
$InstallDir = Join-Path $env:ProgramFiles "CafeCAM"
$Manager = Join-Path $InstallDir "CafeCamManager.exe"
$Clsid = "{C4E3F6B2-9B63-4C4F-9D7F-1D30E0C65B65}"
if (Test-Path $Manager) { & $Manager remove | Out-Host }
$root = "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\CLSID\$Clsid"
if (Test-Path $root) { Remove-Item $root -Recurse -Force }
if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
Write-Host "CafeCAM removed successfully." -ForegroundColor Green