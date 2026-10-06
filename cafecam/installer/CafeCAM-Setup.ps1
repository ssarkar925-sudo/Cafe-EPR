# CafeCAM one-click Windows installer
$ErrorActionPreference = "Stop"

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  Start-Process -FilePath $PSCommandPath -Verb RunAs
  exit
}

$installDir = Join-Path $env:ProgramFiles "CafeCAM"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
[IO.File]::WriteAllBytes((Join-Path $installDir "CafeCamManager.exe"), [Convert]::FromBase64String("__MANAGER_B64__"))
[IO.File]::WriteAllBytes((Join-Path $installDir "CafeCamMediaSource.dll"), [Convert]::FromBase64String("__DLL_B64__"))

$clsid = "{C4E3F6B2-9B63-4C4F-9D7F-1D30E0C65B65}"
$base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64)
$clsidKey = $base.CreateSubKey("SOFTWARE\Classes\CLSID\$clsid")
$inproc = $clsidKey.CreateSubKey("InprocServer32")
$clsidKey.SetValue($null, "CafeCAM Virtual Camera")
$inproc.SetValue($null, (Join-Path $installDir "CafeCamMediaSource.dll"))
$inproc.SetValue("ThreadingModel", "Both")
$inproc.Dispose()
$clsidKey.Dispose()
$base.Dispose()

$manager = Join-Path $installDir "CafeCamManager.exe"
$p = Start-Process -FilePath $manager -ArgumentList "install-synthetic" -Wait -PassThru -WindowStyle Hidden
if ($p.ExitCode -ne 0) { throw "CafeCAM virtual camera registration failed with exit code $($p.ExitCode)." }

exit 0