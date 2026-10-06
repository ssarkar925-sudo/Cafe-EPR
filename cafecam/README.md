# CafeCAM

CafeCAM is the Windows-native virtual camera layer for CafeERP.

The native solution contains the Media Foundation camera source and a small manager executable. The default registration uses SoftwareCameraSource, system lifetime and current-user access. A physical camera can be wrapped through IMFVirtualCamera::AddDeviceSourceInfo.

Windows 11, Visual Studio 2022/MSBuild and a Windows SDK with virtual-camera support are required. The generated x64 package contains the DLL, manager and PowerShell installer scripts.

The CafeERP Electron bridge invokes the manager through explicit arguments without a shell. The dashboard page is at /cafecam.

See native/THIRD_PARTY_NOTICES.md for Microsoft attribution.