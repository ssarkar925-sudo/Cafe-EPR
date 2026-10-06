[CmdletBinding()]
param([switch]$SkipVirtualCamera)
$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $args = @("-NoLogo","-NoProfile","-ExecutionPolicy","Bypass","-File",$PSCommandPath)
    if ($SkipVirtualCamera) { $args += "-SkipVirtualCamera" }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $args -Wait
    exit $LASTEXITCODE
}

$Candidates = @(
  (Join-Path $PSScriptRoot "CafeCamMediaSource.dll"),
  (Join-Path $PSScriptRoot "..\native\bin\x64\Release\CafeCamMediaSource.dll")
)
$Dll = $Candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Dll) { throw "CafeCAM payload not found." }
$Payload = Split-Path $Dll -Parent
$Manager = Join-Path $Payload "CafeCamManager.exe"
if (-not (Test-Path $Manager)) { throw "CafeCamManager.exe not found beside payload." }
$InstallDir = Join-Path $env:ProgramFiles "CafeCAM"
$Clsid = "{C4E3F6B2-9B63-4C4F-9D7F-1D30E0C65B65}"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item $Dll (Join-Path $InstallDir "CafeCamMediaSource.dll") -Force
Copy-Item $Manager (Join-Path $InstallDir "CafeCamManager.exe") -Force
$UninstallerSource = Join-Path $PSScriptRoot "Uninstall-CafeCAM.ps1"
if (Test-Path $UninstallerSource) { Copy-Item $UninstallerSource (Join-Path $InstallDir "Uninstall-CafeCAM.ps1") -Force }
$root = "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\CLSID\$Clsid"
New-Item -ItemType Directory -Force -Path "$root\InprocServer32" | Out-Null
Set-ItemProperty -Path $root -Name "(Default)" -Value "CafeCAM Virtual Camera"
Set-ItemProperty -Path "$root\InprocServer32" -Name "(Default)" -Value (Join-Path $InstallDir "CafeCamMediaSource.dll")
Set-ItemProperty -Path "$root\InprocServer32" -Name "ThreadingModel" -Value "Both"
if (-not $SkipVirtualCamera) {
  & (Join-Path $InstallDir "CafeCamManager.exe") install-synthetic
  if ($LASTEXITCODE -ne 0) { throw "CafeCAM virtual camera registration failed." }
}
Write-Host "CafeCAM installed successfully." -ForegroundColor Green
Write-Host "Installed to: $InstallDir"