# Echo - Fehlerbehebung & Administrations-Handbuch (Troubleshooting Guide)

Dieses Dokument bietet Hilfestellung bei der Installation, Konfiguration und Behebung typischer Probleme mit **Echo**.

---

## 📋 Inhaltsverzeichnis
1. [Systemvoraussetzungen](#1-systemvoraussetzungen)
2. [Audio-, Video- & Mikrofon-Probleme](#2-audio---video---mikrofon-probleme)
3. [Datenbank-Konfiguration (SQLite vs. MariaDB)](#3-datenbank-konfiguration-sqlite-vs-mariadb)
4. [Netzwerk & WebRTC (Verbindungsprobleme)](#4-netzwerk--webrtc-verbindungsprobleme)
5. [Docker- & Plattform-Spezifika](#5-docker---plattform-spezifika)
6. [Häufig gestellte Fragen (FAQ)](#6-haeufig-gestellte-fragen-faq)

---

## 1. Systemvoraussetzungen
* **Node.js:** Version 18.x oder höher (empfohlen wird die aktuelle LTS-Version v20+).
* **NPM:** Version 9.x oder höher.
* **Browser:** Moderne Browser mit WebRTC-Unterstützung (Chrome, Firefox, Edge, Safari).
* **Docker & Docker Compose (optional):** Für den containerisierten Betrieb.

---

## 2. Audio-, Video- & Mikrofon-Probleme

### Mikrofon oder Kamera/Bildschirm wird nicht erkannt
1. **Berechtigungen prüfen:** Der Browser muss die Berechtigung besitzen, auf das Mikrofon und die Bildschirmübertragung zuzugreifen. Wenn Sie die Seite das erste Mal laden, akzeptieren Sie die Berechtigungsanfrage. In Chrome/Firefox können Sie diese links neben der URL-Leiste (Schlosssymbol) überprüfen.
2. **Kein HTTPS in Produktion:** Browser blockieren Mikrofon-Zugriffe (`getUserMedia`) und Bildschirmfreigaben (`getDisplayMedia`) auf ungesicherten Verbindungen. Im lokalen Betrieb (`localhost`) ist der Zugriff standardmäßig erlaubt. Für eine Produktions-Bereitstellung ist ein SSL-Zertifikat (HTTPS) zwingend erforderlich (z. B. via Let's Encrypt).
3. **Stummschaltung:** Prüfen Sie, ob Sie im Echo-UI stummgeschaltet sind (roter Button "Stumm" im Profilbereich) oder ob Ihr Systemmikrofon stummgeschaltet ist.

### Rückkopplung / Pfeifen (Larsen-Effekt)
Wenn Sie die Option **"Selber hören" (Echomodus)** aktivieren, hören Sie Ihr eigenes Mikrofon-Signal. 
> [!WARNING]
> Verwenden Sie bei eingeschaltetem Echomodus unbedingt Kopfhörer! Andernfalls wird der Ton der Lautsprecher wieder vom Mikrofon aufgenommen, was zu einer lauten, unangenehmen akustischen Schleife (Pfeifen) führt.

### Mikrofon klingt abgehackt, roboterhaft oder dumpf
Echo bietet eine Reihe von professionellen Hardware- und Software-Filtern, um die Qualität anzupassen:
1. **Voice Activation Threshold (Noise Gate):** Der Regler bestimmt die Empfindlichkeit, ab der Ihre Stimme übertragen wird. Wenn Sie abgehackt klingen, stellen Sie den Regler weiter nach links (niedrigerer Schwellenwert). Wenn Hintergrundgeräusche übertragen werden, schieben Sie ihn weiter nach rechts.
2. **Echo-Kompensation (AEC - Acoustic Echo Cancellation):** Verhindert, dass der Ton der anderen Benutzer aus Ihren Lautsprechern wieder in Ihr Mikrofon gelangt. Sollten Sie ein sehr gutes Headset oder Studiomikrofon besitzen und AEC die Stimme verzerrt, schalten Sie AEC in den Audio-Einstellungen aus.
3. **Auto-Verstärkung (AGC - Automatic Gain Control):** Passt die Lautstärke Ihrer Stimme automatisch an. Kann bei manchen empfindlichen Mikrofonen zu Rauschen führen. Versuchen Sie, AGC zu deaktivieren, falls Ihr Ton übersteuert.
4. **Tastatur-Hochpassfilter (HPF):** Filtert Frequenzen unter 150 Hz heraus. Das eliminiert tieffrequente Störgeräusche wie Tastaturanschläge (z. B. von mechanischen Tastaturen) oder das Brummen von Lüftern. Deaktivieren Sie ihn, falls Sie eine sehr tiefe Stimme haben und diese natürlicher klingen soll.
5. **Browser-Noise Suppression (Filter-Button):** Nutzt die native Rauschunterdrückung des Browsers.
   > [!TIP]
   > Wenn sowohl die Browser-Rauschunterdrückung als auch Web Audio API Filter aktiv sind, kann der Ton "unterwasserartig" klingen. Kalibrieren Sie diese Toggles schrittweise, um das beste Ergebnis für Ihre Hardware zu erzielen.

---

## 3. Datenbank-Konfiguration (SQLite vs. MariaDB)

Echo nutzt **Knex** als SQL-Query-Builder und unterstützt sowohl eine dateibasierte SQLite-Datenbank als auch eine produktionsbereite MariaDB (oder MySQL).

Die Konfiguration erfolgt im Verzeichnis `server/` über die `.env`-Datei. Eine Vorlage finden Sie in `server/.env.example`.

### Option A: SQLite (Standard, Konfigurationsfrei)
Perfekt für Tests oder kleine Server. Es wird eine lokale Datei `server/echo.sqlite` erstellt.
```env
DB_TYPE=sqlite
```

### Option B: MariaDB / MySQL
Für den performanten Betrieb mit vielen Benutzern.
```env
DB_TYPE=mariadb
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=echo_user
DB_PASS=IhrSicheresPasswort
DB_NAME=echo_db
```
*Stellen Sie sicher, dass die MariaDB-Instanz läuft und die Datenbank `echo_db` existiert. Die Tabellen werden beim Start des Servers automatisch über Knex-Migrationen generiert.*

---

## 4. Netzwerk & WebRTC (Verbindungsprobleme)

WebRTC stellt direkte Peer-to-Peer-Verbindungen zwischen den Clients für die Audio- und Videoströme her.

### Symptom: Benutzer sehen sich, hören oder empfangen aber keine Videos
Wenn Benutzer zwar Text-Nachrichten austauschen und die Kanalliste aktualisiert sehen, aber keine Medienströme ankommen (der WebRTC-Verbindungsstatus schlägt fehl):
1. **STUN/TURN-Server:** Echo nutzt standardmäßig öffentliche Google STUN-Server in `useWebRTC.ts`. In stark restriktiven Firmennetzwerken (symmetrisches NAT / restriktive Firewalls) blockieren diese jedoch. Hier muss ein eigener TURN-Server (z. B. **coturn**) aufgesetzt und in der `rtcConfig` in `client/src/hooks/useWebRTC.ts` eingetragen werden.
2. **Portweiterleitung / Firewall:** 
   * Der Express-Server läuft standardmäßig auf Port **3001** (sowohl für Socket.io-Signaling als auch für statische Dateien im Produktionsmodus). Dieser Port muss in Ihrer Firewall geöffnet sein.
   * WebRTC benötigt zusätzlich dynamische UDP-Ports für den Audiotransfer. Stellen Sie sicher, dass ausgehende UDP-Pakete nicht durch Ihre lokale Firewall blockiert werden.

### Reverse Proxy Setup (z. B. Nginx)
Wenn Sie Echo hinter Nginx betreiben, müssen Sie sicherstellen, dass WebSockets korrekt weitergeleitet werden. 
Beispiel-Nginx-Konfiguration:
```nginx
server {
    listen 80;
    server_name echo.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 5. Docker- & Plattform-Spezifika

### Starten mit Docker Compose
Echo kann über ein Multi-Stage Dockerfile in einem einzigen Container bereitgestellt werden.
```bash
docker compose up --build -d
```
Der Container kompiliert das React-Frontend und fügt es in das Node-Backend ein. Das System ist danach vollständig über `http://localhost:3001` erreichbar.

### SQLite in Docker
Wenn Sie SQLite innerhalb von Docker nutzen und die Daten bei Container-Updates nicht verlieren möchten, binden Sie die SQLite-Datei als Docker Volume ein:
```yaml
volumes:
  - ./server/echo.sqlite:/app/server/data/echo.sqlite
```

---

## 6. Häufig gestellte Fragen (FAQ)

#### F: Mein Account-Key ist weg, wie erhalte ich wieder Admin-Rechte?
A: Wenn Sie Ihren Key verlieren, können Sie sich nicht mehr als dieser Benutzer anmelden. Als Server-Administrator können Sie jedoch direkt in der SQL-Datenbank (Tabelle `users`) nach Ihrem Benutzernamen suchen und den `account_key` auslesen oder Ihre Rolle in einem anderen Account auf `admin` setzen.

#### F: Wie kann ich Kanäle erstellen/löschen?
A: Nur Benutzer mit der Rolle `admin` können Kanäle erstellen oder bearbeiten. Klicken Sie dazu auf den Button **"🛡️ Admin-Bereich"** oben rechts. Dort können Sie Berechtigungen für Sprach- und Textkanäle festlegen und verwalten, wer Zugang hat.

#### F: Ist die Audio- und Video-Übertragung verschlüsselt?
A: Ja. WebRTC erzwingt eine DTLS/SRTP-Verschlüsselung auf Protokollebene. Alle Sprachdaten und Videoströme werden direkt zwischen den Benutzern Ende-zu-Ende verschlüsselt übertragen.
