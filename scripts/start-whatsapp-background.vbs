Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = scriptDir & "\start-whatsapp-service.bat"
WshShell.Run "cmd /c """ & batPath & """", 0, False
Set WshShell = Nothing
Set fso = Nothing
