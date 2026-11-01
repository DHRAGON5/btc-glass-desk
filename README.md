# BTC Glass Desk

Ein Bitcoin Analyse System für einen privaten Nutzer. Öffentliche Kraken Spot Daten, elf regelbasierte Analysemodule, installierbare PWA und Web Push. Das System besitzt keine Funktionen zum Platzieren von Orders und verlangt keine Kraken Zugangsdaten.

Im aktuellen Kontrollmodus erzeugt ausschließlich Regel 1 Signale. Sie verlangt eine Seitwärtsphase direkt am Hoch oder Tief der vergangenen 24 Stunden, drei getrennte Fehlausbrüche und eine spätere Gegenreaktion. Regel 2 und alle Zusatzsetups sind bis zur Neukalibrierung gesperrt.

Die Oberfläche verwendet neutrales, transparentes Glas ohne blauen Farbstich. Bei Mausbewegungen folgen Lichtreflexe dem Zeiger, kleine Karten heben und neigen sich dezent, Buttons reagieren beim Überfahren und Klicken. Der Chart bleibt dabei stabil bedienbar. Auf Touchscreens entfallen die Mausbewegungen; die Systemeinstellung für reduzierte Bewegung wird berücksichtigt. Die Transparenz bezieht sich auf den Hintergrund innerhalb der App.

## Schnellstart auf dem Mac

Voraussetzung: Node.js 24 LTS von https://nodejs.org/ installieren. Das Paket entpacken und im Terminal in den entpackten Ordner `BTC_Glass_Desk` wechseln.

```bash
cd ~/Downloads/BTC_Glass_Desk
npm ci
npm run setup
npm run build
npm start
```

1. `http://localhost:3000` öffnen. Nicht die HTML Datei doppelt anklicken.
2. Die Datei `.env` öffnen. Im Finder zeigt `Cmd + Shift + .` versteckte Dateien an.
3. Mit dem Wert hinter `APP_PASSWORD=` anmelden. Es ist ein eigenes App Passwort.
4. Hinter `VAPID_SUBJECT=` deine E Mail Adresse in der Form `mailto:du@beispiel.de` eintragen. Server danach neu starten.
5. In den Einstellungen deinen tatsächlichen Gebührensatz je Seite eintragen. Der voreingestellte Wert von 5 Basispunkten ist nur eine Beispielannahme und keine aktuelle Tarifauskunft.
6. Warten, bis die Datenprüfung bestanden ist. 5m und 15m erzeugen Signale mit getrennten Profilen. 1m dient nur als Chart und 1h als Kontext.

`npm run setup` erzeugt VAPID Schlüssel, Sitzungsschlüssel und App Passwort selbst. Bestehende Schlüssel werden nicht überschrieben. Für die Marktdaten und die Analyse brauchst du weder einen Kraken Schlüssel noch einen kostenpflichtigen KI Dienst.

Der Server läuft, solange der Prozess läuft. Wenn dein Mac schläft oder du das Terminal schließt, endet die Überwachung. Ein geöffneter Browser allein kann iOS im Hintergrund nicht dauerhaft analysieren lassen.

## Deployment mit dauerhaftem HTTPS Server

Die empfohlene Betriebsart ist ein kleiner Linux Server mit Docker Compose, beispielsweise 1 vCPU und 1 GB RAM, sowie eine eigene Subdomain. Ein normaler dauerhaft laufender Container ist nötig. Reines statisches Hosting und pausierende Serverless Funktionen ersetzen diesen Analyseserver nicht. Ein einzelner Prozess genügt, keine mehreren Replikate auf dieselbe Datenbank starten.

1. Bei einem Hoster einen Linux Server mit Docker Engine und dem Docker Compose Plugin bereitstellen. Installationsanleitung: https://docs.docker.com/engine/install/ubuntu/
2. Eine Subdomain wie `btc.deine-domain.de` per DNS A Eintrag auf die öffentliche IPv4 Adresse des Servers zeigen lassen. Falls ein AAAA Eintrag existiert, muss auch dessen IPv6 Adresse zu deinem Server führen.
3. Eingehend TCP 80 und 443 erlauben, optional UDP 443. Ausgehend DNS sowie HTTPS und WSS zu Kraken und den Push Anbietern erlauben. Caddy kümmert sich automatisch um das TLS Zertifikat.
4. Den entpackten Projektordner auf den Server kopieren, beispielsweise per SFTP. `.env` nur über den geschützten eigenen Zugang übertragen. Alternativ frisch auf dem Server erzeugen.
5. Im Projektordner auf dem Server die Konfiguration erzeugen:

```bash
docker run --rm -v "$PWD:/app" -w /app node:24-alpine sh -c 'npm ci && npm run setup'
```

6. In `.env` die folgenden Angaben setzen. Die automatisch erzeugten Werte für `APP_PASSWORD`, `SESSION_SECRET` und die beiden VAPID Schlüssel behalten.

```dotenv
PORT=3000
PUBLIC_ORIGIN=https://btc.deine-domain.de
VAPID_SUBJECT=mailto:deine@email.de
DOMAIN=btc.deine-domain.de
ACME_EMAIL=deine@email.de
```

Die Domain in `PUBLIC_ORIGIN` und `DOMAIN` muss identisch sein. `PUBLIC_ORIGIN` enthält `https://`, `DOMAIN` enthält nur den Hostnamen. Kein abschließender Pfad ist nötig. `DATA_DIR` wird im Container auf `/data` gesetzt.

7. Starten:

```bash
docker compose -f compose.prod.yml up -d --build
docker compose -f compose.prod.yml logs --tail=80 desk caddy
```

8. `https://btc.deine-domain.de` öffnen und mit `APP_PASSWORD` anmelden. Erst bei bestandener Datenprüfung mit den Signalen arbeiten.
9. Die App auf jedem Gerät installieren, öffnen und dort separat Push aktivieren. In den Einstellungen eine Testnachricht senden. Die Meldung muss auf dem jeweiligen Gerät ankommen.

Die produktive Konfiguration veröffentlicht nur Caddy auf 80 und 443. Die App auf Port 3000 bleibt im internen Container Netzwerk. Ein eigener Passwortschutz und signierte HttpOnly Sitzungscookies schützen Einstellungen, Journal und Push Abonnements. Keine Kraken Konten werden verbunden.

### Aktualisieren, stoppen, sichern

```bash
docker compose -f compose.prod.yml up -d --build
docker compose -f compose.prod.yml stop
```

Daten und Geräteschlüssel liegen im Docker Volume `desk_data`. Für eine konsistente Sicherung zuerst den Dienst stoppen, dann das Volume und die `.env` Datei geschützt sichern. Nicht `down -v` ausführen, wenn du Daten behalten möchtest. Bei Wiederherstellung VAPID Schlüssel beibehalten, sonst müssen Geräte neu abonniert werden.

### Lokal mit Docker statt Node

Nach dem Erzeugen der `.env` Datei:

```bash
docker compose up -d --build
```

Diese Variante ist ausschließlich unter `http://localhost:3000` erreichbar. Für iPhone und dauerhaften HTTPS Betrieb die Produktionskonfiguration verwenden.

## Installation auf iPhone und Mac

### iPhone

1. iOS 16.4 oder neuer verwenden.
2. Die HTTPS Adresse deines laufenden Servers in Safari öffnen.
3. Teilen wählen und „Zum Home Bildschirm“ auswählen. Wenn Safari „Als Web App öffnen“ anbietet, diese Option aktiv lassen.
4. Die App über das neue Icon starten und bei Bedarf erneut anmelden. Die installierte App kann einen eigenen Sitzungsspeicher verwenden.
5. Den Button „Push aktivieren“ antippen und die Systemfreigabe erlauben. Die Freigabe wird bewusst nur nach deinem Klick angefragt.
6. Eine Testnachricht aus den Einstellungen senden. In iOS Mitteilungen und Fokus Einstellungen die App bei Bedarf zulassen.

Ein Safari Tab allein reicht für iPhone Web Push nicht aus. HTTPS, Installation und eine ausdrückliche Erlaubnis sind nötig. Ein Apple Entwicklerkonto ist für standardbasierten Web Push nicht erforderlich. Der Server muss auch bei geschlossener App weiterlaufen. Zustellung und Geschwindigkeit hängen zusätzlich von Netzwerk, Betriebssystem und Push Anbieter ab.

### Mac

1. Ab macOS Sonoma: HTTPS Adresse in Safari öffnen und „Ablage“, „Zum Dock hinzufügen“ wählen.
2. Die App aus dem Dock starten, anmelden und Push erlauben.
3. Das Fenster schmal neben Kraken Pro platzieren. Unter 930 Pixel Breite ordnen sich die Karten untereinander an.

Alternativ kann ein unterstützter Chromium Browser die PWA installieren. Safari Web Push wird auf unterstützten Versionen ab macOS Ventura unterstützt, während das Hinzufügen zum Dock macOS Sonoma benötigt.

## Was die veröffentlichte Webseite macht

Die bereitgestellte private Webseite enthält dieselbe Oberfläche und denselben Analysecode. Ohne Node Backend erkennt sie automatisch den Browsermodus und verbindet sich direkt mit öffentlichen Kraken Daten. Sie ist nutzbar, solange die Seite aktiv läuft. Sie speichert Einstellungen lokal und hält das Journal dieser Sitzung im Speicher.

Für dauerhaftes Monitoring und Push musst du den Server aus diesem Paket deployen und die PWA von dessen eigener HTTPS Adresse installieren. Die veröffentlichte statische Webseite besitzt keinen dauerhaften Analyseprozess und sendet selbst keinen Hintergrund Push. Der Button erklärt diese Voraussetzung.

Der ausdrücklich markierte Demomodus zeigt ausschließlich simulierte Kurse, Liquidität und Beispielsignale. Er dient der Bedienung und ist keine Marktanalyse. Der Standardmodus ist die echte Kraken Verbindung. Bei fehlenden Daten werden keine künstlichen Kurse eingesetzt.

## Warum dieser Stack

Node.js, Express, WebSocket und SQLite halten den Betrieb in einem einzigen Container mit lokalem persistentem Speicher. Vite bündelt eine schlanke Oberfläche mit TradingView Lightweight Charts; Service Worker und Web Push ergänzen die Installation und Benachrichtigungen ohne kostenpflichtige Modellaufrufe.

## Die sechs sichtbaren Agenten

Die Oberfläche zeigt nur noch Module mit einer konkreten Aufgabe. Es sind keine sechs Sprachmodelle und keine voneinander unabhängigen Beweise für einen profitablen Trade.

| Agent | Aufgabe |
| --- | --- |
| Regel 1 Wächter | Erkennt die vollständige Abfolge am 24 Stunden Extrem |
| News Agent | Filtert Bitcoin Meldungen der letzten 48 Stunden nach Quelle, Thema und möglicher Marktwirkung |
| Liquiditäts Agent | Berechnet sichtbare Mengen auf den besten zehn Kraken Preisleveln |
| Risiko Agent | Prüft Stopbereich, Spread, Gebühren und Netto CRV |
| Datenwächter | Aktualität der Teilfeeds, Kerzenlücken und Orderbuch Prüfsumme |
| Edge Analyst | Bewertet bestätigte Signale und erzeugt 10.000 Bayes Szenarien aus realen Ergebnissen |

Der News Agent lädt während der geöffneten App alle fünf Minuten neu. Er entfernt Meldungen ohne klaren Bitcoin Bezug und stuft Sicherheitsvorfälle, gestoppte Auszahlungen, ETF Bewegungen, Liquidationen, Notenbanktermine und Makrorisiken höher ein. Browserbenachrichtigungen funktionieren nur bei geöffneter App. Echte Hintergrundmeldungen benötigen weiterhin den dauerhaft laufenden Server oder eine getrennte Automation.

## Regeln und Zustände

Die ausführliche Definition steht in `docs/REGELN.md`. Die wichtigsten Entscheidungen:

1. Nur Regel 1 läuft auf abgeschlossenen 5m und 15m Kerzen mit getrennten Parametern. 1m besitzt keine Analyse Engine.
2. Eine Kerze gilt erst dann als abgeschlossen, wenn die nächste Kraken Kerze eingetroffen ist. Kein lokaler Timer bestätigt eine möglicherweise unvollständige Kerze.
3. Regel 1 beginnt nur an einer lokalen Seitwärtsphase direkt am Hoch oder Tief der vergangenen 24 Stunden. Sie benötigt drei getrennte Fehlausbrüche und danach eine bestätigte Gegenreaktion.
4. Regel 2 ist bis zur getrennten Neukalibrierung technisch gesperrt.
5. Ein Stopkontakt kann ein aktives Setup schon während der laufenden Kerze ungültig machen, sofern aktuelle Trades und geprüfte Daten vorliegen.
6. Ein technisches Muster kann bestätigt sein, obwohl Gebühren, Spread oder Zielabstand gegen einen Entry sprechen. Solche Hinweise zeigen die Warnung ausdrücklich.
7. Liquidity Sweep und VWAP Reclaim sind während des kontrollierten Neustarts technisch gesperrt.

## Bookmap und Datenqualität

Bookmap bietet APIs für lokale Erweiterungen und Datenadapter. Das ist kein frei zugänglicher Cloud Feed deiner Bookmap Sitzung. Hier besteht keine Verbindung zu deiner lokalen Instanz. Stattdessen verwendet dieses System das öffentliche Kraken L2 Orderbuch mit 100 Leveln pro Seite.

Die Heatmap sammelt alle fünf Sekunden eine Aufnahme und hält die letzten zehn Minuten im Arbeitsspeicher. Sie zeigt nur sichtbare Limit Orders auf Kraken Spot BTC/USD. Versteckte Orders, weitere Börsen, vollständige Markttiefe oder eine sichere Aussage über echte Kaufabsicht sind daraus nicht ableitbar. Die Zeitachse zeigt relative Historie, die Preisachse bleibt innerhalb jeder Darstellung fest. Nach einem Neustart beginnt die Karte neu.

Das Orderbuch verarbeitet Updates in Reihenfolge, löscht Nullmengen, begrenzt die Tiefe und validiert CRC32 über die besten zehn Level. Dezimalwerte behalten bei der Prüfsumme ihre Originalpräzision. Bei Fehlern wird neu verbunden. Ein frischer Heartbeat allein reicht nicht: Orderbuch, Trades und Kerzen müssen ebenfalls aktuell sein. Verbindungen versuchen sich mit wachsendem Abstand bis maximal etwa 30 Sekunden neu aufzubauen.

Historische Daten und nach einem Ausfall nachgeladene Ereignisse werden nicht als neue Push Signale ausgegeben. Ereignis IDs und SQLite verhindern doppelte Journal Einträge. Der Push Versand verwendet eine persistente Warteschlange, höchstens drei Versuche und eine kurze Lebensdauer. Web Push kann keine garantierte sekundengenaue Zustellung liefern.

## Backtest und Tests

```bash
npm test
node scripts/fetch-candles.mjs 5 btc_5m.csv
npm run backtest -- btc_5m.csv --tf 5 --fee-bps 40 --slippage-bps 2 --out result.json
```

Der Datenabruf liefert nur die begrenzte jüngste Kraken Historie und entfernt die letzte, laufende Kerze. Das ist ein Funktionstest, keine ausreichende historische Datenbasis. Für belastbare Aussagen mehrere Monate aus unterschiedlichen Marktphasen mit konsistentem Handelsplatz verwenden. CSV Format: `time,open,high,low,close,volume`, Unix Zeit in Sekunden, aufsteigend und ohne Duplikate. Für 15m passende 15m Daten und `--tf 15` verwenden.

Der Backtest füllt erst am nächsten Kerzenopen innerhalb der Entry Zone. Er berücksichtigt Gebühren und Slippage, erlaubt nur eine Position gleichzeitig, nimmt bei gleichzeitigem Stop und Ziel innerhalb einer Kerze den Stop zuerst an und beendet Positionen nach sechs Folgekerzen. Signale unter dem Mindest CRV nach Kosten werden übersprungen. Historisches Orderbuch, Ausführungswarteschlangen, dynamische Spreads, Funding und echte Latenzen sind nicht simuliert. Die Ausgabe ist eine Modellrechnung.

Bei der Auslieferung: 23 automatisierte Tests bestanden, Produktionsbuild erfolgreich, echte REST Kerzen geladen und ein CSV Backtest technisch ausgeführt. Dieser kurze Datensatz mit den vorsichtigen Standardkosten lieferte keine ausgeführten Modelltrades. Daraus wird keine Profitabilität abgeleitet. HTTP Anmeldung, geschützte Endpunkte, WebSocket Anmeldung, Datenpersistenz, Duplikaterkennung, Long und Short Logik und Intrabar Invalidation sind getestet.

Im Browser wurden der öffentliche Kraken Datenstrom, aktuelle Trades, ein geprüftes Orderbuch, die Heatmap und echte Zustandsmeldungen erfolgreich beobachtet. Kraken erhält für 1m, 5m, 15m und 1h getrennte WebSocket Verbindungen. Der direkte Serverzugriff auf Kraken konnte in der eingeschränkten Ausführungsumgebung wegen DNS Zugriff nicht vollständig geprüft werden. iOS Push Zustellung, Installation auf echten Apple Geräten und produktives Docker TLS konnten hier nicht auf deinen Geräten beziehungsweise deinem Server getestet werden. Die integrierte Testnachricht und Datenstatusanzeige dienen der Abnahme nach deinem Deployment.

## Dateien

| Pfad | Inhalt |
| --- | --- |
| `package.json`, `package-lock.json` | Befehle und reproduzierbare Abhängigkeiten |
| `vite.config.js`, `index.html` | Frontend Build und Dokument |
| `src/main.js`, `src/style.css` | Vollständige Oberfläche, Chart, Zonen, Feed und Einstellungen |
| `src/demo.js` | Klar markierte Simulationsdaten für die Bedienung |
| `core/engine.mjs` | Beide Regeln, optionale Setups, Agenten und Risikomodell |
| `core/edge.mjs` | Ergebnisverfolgung, Bayes Modell und Unsicherheitsbereiche |
| `core/market.mjs` | Kraken Historie, Live Feed, Wiederverbindung und Datenzustand |
| `core/book.mjs` | Präzises Orderbuch und CRC32 |
| `server/index.mjs` | Server, Anmeldung, API, Stream und Push Versand |
| `server/storage.mjs` | Persistenz und Push Warteschlange |
| `server/security.mjs` | Signierte Sitzungen und Push Zielprüfung |
| `public/sw.js`, `public/manifest.webmanifest` | PWA und Benachrichtigungen |
| `public/icons/` | SVG Logo und PNG Icons inklusive Apple und maskierbarem Icon |
| `scripts/setup.mjs` | Erzeugt lokale Konfiguration und Schlüssel |
| `scripts/fetch-candles.mjs` | Exportiert abgeschlossene Kraken Kerzen als CSV |
| `scripts/backtest.mjs` | Kausale Simulation der Hauptregeln |
| `scripts/package-source.py` | Erstellt dieses Quellcodepaket ohne Secrets |
| `tests/` | Automatisierte Tests für Regeln, Marktdaten und Server |
| `Dockerfile`, `compose.yml` | Lokaler Containerbetrieb |
| `compose.prod.yml`, `Caddyfile` | Dauerbetrieb mit automatischem HTTPS |
| `.env.example`, `.gitignore`, `.dockerignore` | Konfigurationsvorlage und Ausschlüsse |
| `docs/REGELN.md`, `docs/BETRIEB.md`, `docs/QUELLEN.md` | Definitionen, Fehlerbehebung und technische Referenzen |
| `THIRD_PARTY_NOTICES.md`, `LICENSE` | Lizenzhinweise |

## Hinweis

Die Signale sind keine Anlageberatung. Weder die Anzahl der Agenten noch ein bestätigtes Muster garantiert einen profitablen Entry. Backtesting und anschließendes Paper Trading beider Regeln sind sinnvoll, bevor du dich auf das System verlässt.
