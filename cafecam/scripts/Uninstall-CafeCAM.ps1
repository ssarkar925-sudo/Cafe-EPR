[CmdletBinding()] param()
$ErrorActionPreference="Stop"
$InstallDir=Join-Path $env:ProgramFiles "CafeERP\CafeCAM"
$Manager=Join-Path $InstallDir "CafeCamManager.exe"
$Clsid="{C4E3F6B2-9B63-4C4F-9D7F-1D30E0C65B65}"
if(Test-Path $Manager){& $Manager remove|Out-Host}
$root="Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\CLSID\$Clsid"
if(Test-Path $root){Remove-Item $root -Recurse -Force}
if(Test-Path $InstallDir){Remove-Item $InstallDir -Recurse -Force}
Write-Host "CafeCAM removed."