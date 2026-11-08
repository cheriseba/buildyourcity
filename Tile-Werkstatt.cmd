@echo off
cd /d "%~dp0"
echo Tile-Werkstatt wird gestartet. Browser: http://127.0.0.1:8766/
node tools\tile-workshop-server.js --open
echo.
echo Werkstatt beendet. Falls ein Fehler angezeigt wird, Node.js und den Port pruefen.
pause
