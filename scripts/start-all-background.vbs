Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' 1. Start WhatsApp Gateway on port 3001 (silently in background)
WshShell.Run "cmd /c """ & scriptDir & "\start-whatsapp-service.bat""", 0, False

' 2. Wait 2 seconds
WScript.Sleep 2000

' 3. Start CafeERP Dev Server on port 3000 (silently in background)
WshShell.Run "cmd /c """ & scriptDir & "\start-dev-service.bat""", 0, False

Set WshShell = Nothing
Set fso = Nothing
