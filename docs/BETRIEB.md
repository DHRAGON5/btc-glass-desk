# Betrieb und Fehlerbehebung

## Anmeldung scheitert

`APP_PASSWORD` exakt aus `.env` übernehmen. Nicht das Kraken Passwort verwenden. Mindestens 16 Zeichen erforderlich. `SESSION_SECRET` benötigt mindestens 32 Zeichen. `npm run setup` erledigt beides. Für Produktionsbetrieb müssen HTTPS Origin, DNS Domain und Browseradresse identisch sein. Ein Wechsel zwischen localhost und 127.0.0.1 kann den Origin Schutz auslösen.

Nach zwanzig Anmeldeversuchen je IP innerhalb von fünfzehn Minuten erfolgt eine Sperre. Bei verlorenem Passwort kann der Betreiber `.env` ändern und den Container neu starten. Für die Ungültigkeit aller alten Sitzungen gleichzeitig `SESSION_SECRET` erneuern. Neue Sitzungscookies gelten maximal dreißig Tage.

## Chart vorhanden, Verbindung weiterhin ungeprüft

Die REST Historie reicht nicht aus. Die drei Kraken WebSocket Verbindungen müssen erreichbar sein. Pro Verbindung wird genau ein OHLC Intervall für BTC/USD abonniert. Prüfe ausgehende Verbindung zu `wss://ws.kraken.com/v2`, funktionierende DNS Auflösung, TLS Zertifikate, Systemzeit und etwaige Firewall Regeln. Auch ein VPN oder ein eingeschränktes Firmennetz kann den Stream blockieren. Die App versucht eine neue Verbindung automatisch. Es werden keine Ersatzkurse untergeschoben.

Die Freigabe benötigt: Nachrichten jünger als zehn Sekunden, geprüftes Orderbuch jünger als zehn Sekunden, Trades jünger als dreißig Sekunden, aktuelle OHLC Updates für 5m, 15m und 1h und mindestens dreißig Kerzen pro Analysezeitraum. Der zusätzliche 1m Chart gehört nicht zur Freigabelogik. Ein sehr ruhiger Markt kann deshalb vorsichtig als ungeprüft gelten. Bei CRC Fehler wird das Orderbuch neu aufgebaut.

Eine frisch gestartete Session sendet keine alten Signale. FVG Zonen aus der Historie können trotzdem sofort sichtbar sein. Historisch bestätigte Setups werden nicht als neue aktive Entry Hinweise behandelt.

## Push kommt nicht an

1. Von der HTTPS Adresse deines eigenen Node Servers installieren. Die statisch veröffentlichte Browseroberfläche allein hat keinen Hintergrundserver.
2. Auf iPhone die installierte App öffnen, nicht nur den Safari Tab.
3. Nach Anmeldung „Push aktivieren“ antippen. „Testnachricht senden“ befindet sich in den Einstellungen.
4. Mitteilungsrechte und Fokus Einstellungen des Geräts prüfen.
5. VAPID Schlüssel und Kontaktadresse in `.env` prüfen und Server nach Änderung neu starten.
6. Bei geänderten VAPID Schlüsseln das alte Abonnement auf dem Gerät deaktivieren und erneut aktivieren.
7. Der Server braucht ausgehendes HTTPS zu Apple, FCM beziehungsweise Mozilla. Ungültige Abonnements mit HTTP 404 oder 410 werden automatisch entfernt.

Die App meldet nur, ob der Push Anbieter eine Testnachricht angenommen hat. Erst das sichtbare Eintreffen auf deinem Gerät bestätigt die Zustellung. Verzögerungen bleiben möglich. Der Server speichert die letzten Versandfehler intern; `/api/state` enthält für angemeldete Nutzer `pushStatus`.

## App ist offline

Der Service Worker hält Oberfläche und Icons vor. Markt APIs und Sitzungsantworten werden nicht gecacht. Offline bleibt die App grundsätzlich lesbar, produziert aber keine echten neuen Kurse oder Setups. Das lokale Browserjournal wird beim Neuladen nicht persistent wiederhergestellt. Im Serverbetrieb bleibt das Journal in SQLite gespeichert.

## Journal und Datenschutz

Eine Installation ist für einen privaten Nutzer gedacht. Maximal zehn Geräteabonnements. App Passwort und Sitzungsschlüssel, VAPID Privatschlüssel und SQLite Backups vertraulich behandeln. Die SQLite Datei enthält Geräte Push Endpunkte und das Signaljournal. Ein echter Mehrbenutzerbetrieb ist nicht implementiert.

Es gibt keine Nachrichtenübermittlung an Slack, E Mail oder Messenger. Ausschließlich der Standard Push Anbieter des abonnierten Geräts erhält die verschlüsselte Nachricht. Standardmäßig sind alle vier Zustandsänderungen meldefähig. Historie und schlechte Datenqualität unterdrücken den Push Versand. Aktuelle Hinweise mit Kostenwarnung können gesendet werden; sie tragen die Warnung mit.

Die API nutzt HttpOnly Cookies, SameSite Strict, Origin Prüfung, begrenzte Anfragegrößen, Anmelderatenbegrenzung und eine feste Positivliste von Push Anbietern. Kein Trading Schlüssel ist vorgesehen. `npm run dev` ist nur für Entwicklung und bietet keinen Backendbetrieb; `npm start` ist die vollständige App nach dem Build.

## Grenzen

Ein einzelner Prozess und ein lokales SQLite Volume. Kein Hochverfügbarkeitscluster und kein automatisch verwalteter Hosted Dienst. Die Heatmap ist flüchtig. Persistente Settings, Agentenzustand, Edge Ergebnisse und Journal liegen auf dem Server. Der Zustand wird alle fünf Sekunden sowie beim sauberen Stop gespeichert, sodass ein harter Prozessabbruch die letzten Sekunden des internen Zustands verlieren kann. Ereignis IDs verhindern übliche doppelte Journaleinträge nach Neustart.

Markt und Plattform können sich ändern. Vor realem Einsatz Live Feed, Push auf beiden Zielgeräten, Neustart und Wiederverbindung auf dem eigenen Server prüfen. Alle Entscheidungen und jede Order bleiben beim Nutzer.
