Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c ""%~dp0start-whatsapp-service.bat""", 0, False
Set WshShell = Nothing
