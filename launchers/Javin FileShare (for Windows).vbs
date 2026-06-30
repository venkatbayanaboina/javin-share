Dim objShell, objFSO, scriptPath, projectRoot, backendPath, envPath, certPem, keyPem
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get the absolute path of the script directory and resolve project folders
scriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)
projectRoot = objFSO.GetAbsolutePathName(scriptPath & "\..")
backendPath = objFSO.GetAbsolutePathName(projectRoot & "\backend")
envPath = objFSO.GetAbsolutePathName(projectRoot & "\.env")
certPem = objFSO.GetAbsolutePathName(backendPath & "\certs\cert.pem")
keyPem = objFSO.GetAbsolutePathName(backendPath & "\certs\key.pem")

objShell.CurrentDirectory = scriptPath

' Run PowerShell script silently to handle dynamic javin.share.[4char].local host generation
Dim psCommand
psCommand = "-NoProfile -ExecutionPolicy Bypass -Command """ & _
            "if (!(Test-Path '" & envPath & "') -and (Test-Path '" & projectRoot & "\.env.example" & "')) { Copy-Item '" & projectRoot & "\.env.example" & "' '" & envPath & "' };" & _
            "$envPath = '" & envPath & "';" & _
            "$customHost = '';" & _
            "if (Test-Path $envPath) {" & _
            "  $match = Select-String -Path $envPath -Pattern '^CUSTOM_HOST=';" & _
            "  if ($match) { $customHost = $match.Line.Split('=')[1].Trim(\""'` \"" ) }" & _
            "};" & _
            "if (!$customHost -or $customHost -like '*sslip.io*' -or $customHost -like 'javin-share-*' -or $customHost -match '^javin\.share\.[a-z0-9]{4,6}\.local$') {" & _
            "  $customHost = 'javin.share.local';" & _
            "  (Get-Content $envPath) | Where-Object { $_ -notlike 'CUSTOM_HOST=*' } | Set-Content $envPath;" & _
            "  Add-Content $envPath 'CUSTOM_HOST=' + $customHost;" & _
            "  Remove-Item '" & certPem & "' -ErrorAction SilentlyContinue;" & _
            "  Remove-Item '" & keyPem & "' -ErrorAction SilentlyContinue;" & _
            "}" & _
            """"
objShell.Run "powershell.exe " & psCommand, 0, True

' 1. Check if Node.js is installed
On Error Resume Next
Dim errorCode
errorCode = objShell.Run("cmd.exe /c node --version", 0, True)
If Err.Number <> 0 Or errorCode <> 0 Then
    MsgBox "Error: Node.js was not found or is not in your system PATH." & vbCrLf & _
           "Please install Node.js (https://nodejs.org) and try again.", 16, "JAVIN FileShare"
    WScript.Quit 1
End If
On Error GoTo 0

' 2. Check if setup has been run (certificates exist)
If Not objFSO.FileExists(certPem) Or Not objFSO.FileExists(keyPem) Then
    Dim runSetup
    runSetup = MsgBox("Setup is required to generate HTTPS certificates before running the app." & vbCrLf & _
                      "Would you like to run the setup tool now?", 36, "JAVIN FileShare Setup Required")
    If runSetup = 6 Then ' Yes
        Dim objShellApp
        Set objShellApp = CreateObject("Shell.Application")
        objShellApp.ShellExecute "setup (for Windows).bat", "", scriptPath, "runas", 1
    End If
    WScript.Quit 1
End If

' 3. Check if dependencies are installed (run npm install inside backend directory)
If Not objFSO.FolderExists(backendPath & "\node_modules") Then
    MsgBox "First-time launch: Installing dependencies. This will take a moment...", 64, "JAVIN FileShare"
    objShell.CurrentDirectory = backendPath
    objShell.Run "cmd.exe /c npm install --silent", 0, True
End If

' 4. Run the Node.js server silently with a hidden window (style 0)
objShell.CurrentDirectory = projectRoot
objShell.Run "node backend/server.js", 0, False

' 5. Wait a moment for server initialization
WScript.Sleep 2000

' 6. Extract CUSTOM_HOST from .env if available
Dim customHost, displayHost
customHost = ""
displayHost = "localhost"
If objFSO.FileExists(envPath) Then
    On Error Resume Next
    Dim objFile, strLine
    Set objFile = objFSO.OpenTextFile(envPath, 1)
    If Err.Number = 0 Then
        Do Until objFile.AtEndOfStream
            strLine = objFile.ReadLine
            If InStr(strLine, "CUSTOM_HOST=") = 1 Then
                customHost = Mid(strLine, 13)
                customHost = Replace(customHost, """", "")
                customHost = Replace(customHost, "'", "")
                customHost = Trim(customHost)
                Exit Do
            End If
        Loop
        objFile.Close
    End If
    On Error GoTo 0
End If

If customHost <> "" Then
    displayHost = customHost
End If

' 7. Open browser to custom host to ensure secure connection and PWA support
objShell.Run "cmd.exe /c start https://" & displayHost & ":4000", 0, False
