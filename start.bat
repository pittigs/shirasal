@echo off
echo ShirAsal wird gestartet...
echo.

:: Pfad zur portablen Node-Umgebung setzen
set PATH=%~dp0node-env;%~dp0node-env\bin;%PATH%

:: Prüfen ob node-env existiert
if not exist "%~dp0node-env" (
    echo [FEHLER] Die portable Node-Umgebung (node-env) wurde nicht im Hauptverzeichnis gefunden!
    echo Bitte stelle sicher, dass Node.js v22.12.0 installiert ist oder node-env vorliegt.
    pause
    exit /b
)

:: Starten des Backends in eigenem Fenster
echo Starte Backend-Signaling-Server...
start "ShirAsal Backend" cmd /c "cd server && npm run dev"

:: Starten des Frontends in eigenem Fenster
echo Starte Frontend-React-Client...
start "ShirAsal Frontend" cmd /c "cd client && npm run dev"

echo.
echo ShirAsal wurde erfolgreich gestartet!
echo Bitte oeffne http://localhost:5173 in deinem Browser.
echo.
pause
