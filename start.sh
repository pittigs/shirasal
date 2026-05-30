#!/bin/bash
# =====================================================================
# # Echo - Launcher
# Startet den Voicechat-Server und den Vite-Webclient parallel.
# =====================================================================

# Pfad zum Skript-Verzeichnis ermitteln
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Die lokale portable Node.js-Umgebung dem Systempfad voranstellen
export PATH="$SCRIPT_DIR/node-env/bin:$PATH"

clear
echo -e "\e[1;36m"
echo " ███████╗ ██████╗██╗  ██╗ ██████╗ "
echo " ██╔════╝██╔════╝██║  ██║██╔═══██╗"
echo " █████╗  ██║     ███████║██║   ██║"
echo " ██╔══╝  ██║     ██╔══██║██║   ██║"
echo " ███████╗╚██████╗██║  ██║╚██████╔╝"
echo " ╚══════╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝ "
echo -e "\e[0m"
echo "====================================================================="
echo " Startet Echo..."
echo " Node.js Version: $(node -v)"
echo " NPM Version:     $(npm -v)"
echo "====================================================================="
echo ""
echo -e " ➜  Webinterface öffnen: \e[1;36mhttp://localhost:5173/\e[0m"
echo -e " ➜  Drücke \e[1;31mSTRG + C\e[0m, um die Server wieder zu stoppen."
echo ""
echo "---------------------------------------------------------------------"

# Starte die Server
npm run dev
