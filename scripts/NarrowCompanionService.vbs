' Narrow AI Minecraft Companion & Nero Labs Background Supervisor
' Starts node scripts/watchdog.mjs completely invisibly in the background with zero window popups
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

WshShell.CurrentDirectory = "D:\nero-labs-telegram-bot"

nodePath = "node"
wingetNode = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64\node.exe"
If fso.FileExists(wingetNode) Then
  nodePath = """" & wingetNode & """"
End If

WshShell.Run nodePath & " scripts/watchdog.mjs", 0, False
