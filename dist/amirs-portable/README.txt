Amirs Versions - portable pack for Windows Server 2012+

1. Copy this folder to the server (e.g. C:\Apps\amirs-portable)
2. Double-click start.bat  OR  install-service.bat (as Admin, needs nssm\nssm.exe)
3. Open firewall: open-firewall.bat (as Admin)
4. Browser: http://SERVER_IP:8000

No system Python install. Delete the folder to uninstall.

NOTE: .bat files are ASCII-only. Do not save them as UTF-8 with Cyrillic
or cmd.exe on WS2012 will break.
