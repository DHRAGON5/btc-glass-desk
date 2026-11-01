# Präzise Regeldefinition

Die Regeln sind bewusst kausal. Der Algorithmus sieht immer nur bereits eingetroffene Daten. Es gibt keine nachträglich als früher erkennbar ausgegebenen Swing Punkte.

## Gemeinsame Größen

ATR ist der einfache Durchschnitt der letzten 14 True Range Werte, kein Wilder RMA. True Range ist das Maximum aus Kerzenbreite und den beiden Abständen zum vorherigen Schlusskurs. Regel 1 startet erst, wenn vollständige 24 Stunden zusammenhängender Kerzen vorliegen. Kerzenlücken verwerfen den bisherigen Erkennungskontext.

5m und 15m besitzen getrennte Parameterprofile. Der 1m Chart erhält echte Kraken Kerzen, wird aber nie an eine Setup Engine übergeben. 1h bleibt reiner Trend Kontext.

## Regel 1

1. Die vorangegangenen 24 Stunden abgeschlossener Kerzen definieren das Tagestief und Tageshoch. Das sind auf 5 Minuten 288 Kerzen und auf 15 Minuten 96 Kerzen. Die aktuelle Kandidatenkerze gehört noch nicht in dieses Fenster.
2. Die lokale Seitwärtsphase verwendet die eingestellte Anzahl der letzten Kerzen innerhalb dieses Tagesfensters. Ihre Breite muss zwischen 1,5 und 6 ATR liegen. Der Abstand zwischen erstem und letztem Schlusskurs darf höchstens 40 Prozent der Breite betragen.
3. Die Unterkante der lokalen Range muss am Tagestief oder die Oberkante am Tageshoch liegen. Die Toleranz beträgt 0,12 ATR. Ohne diesen Bezug zu einem 24 Stunden Extrem entsteht kein Kandidat.
4. Unterer Fehlausbruch: Das Tief unterschreitet das bisherige 24 Stunden Tief um mehr als 0,12 ATR und die Kerze schließt wieder darüber. Oberer Fehlausbruch spiegelbildlich.
5. Jeder Versuch zählt nur einmal. Vor einem weiteren unteren Versuch muss eine komplette spätere Kerze mit ihrem Tief oberhalb L plus 0,6 ATR liegen. Für obere Versuche muss ihr Hoch unter H minus 0,6 ATR liegen. Aneinanderliegende Dochte sind kein dreifacher Test.
6. Nach dem dritten Versuch entsteht ein gerichtetes Setup. Unten Long, oben Short.
7. Bestätigung Long: eine spätere Kerze schließt über dem Hoch der dritten Ablehnung. Short: Schluss unter deren Tief. Das muss innerhalb von drei Folgekerzen passieren.
8. Stop liegt jenseits des äußersten der drei Versuche plus 0,25 fixierter ATR. Angezeigt wird ein Bereich mit 0,1 aktueller ATR zu jeder Seite. Die konservativ nähere Kante löst die Invalidation aus.
9. Die ursprüngliche Beobachtungszone liegt um das Extrem. Nach Bestätigung zeigt die Entry Zone den bestätigenden Schlusskurs plus und minus 0,15 aktuelle ATR. Die Gegenseite der Range ist das strukturelle Modellziel.

## Regel 2

Regel 2 ist während der Neukalibrierung vollständig gesperrt. Sie erzeugt keine Kandidaten, Signale oder Push Nachrichten.

## Gemeinsame Zustände

| Zustand | Bedeutung |
| --- | --- |
| Entsteht | Die Kernbedingungen liegen vor, Bestätigung fehlt noch |
| Bestätigt | Die definierte Schlusskursbedingung ist eingetreten |
| Ungültig | Stopbereich erreicht, Range verlassen oder Datenlücke |
| Abgelaufen | Bestätigung oder Beobachtung hat ihr Zeitfenster überschritten |
| Ziel erreicht | Die Gegenbewegung hat die gegenüberliegende Range Grenze erreicht |

Bestätigte Setups enden spätestens nach sechs weiteren Kerzen. Ein aktueller Live Trade am Stopbereich kann die Invalidation bereits innerhalb einer laufenden Kerze auslösen. Nur aktuell geprüfte Trades dürfen diesen schnellen Pfad nutzen. Bei Feed Ausfall bleibt der sichtbare Kontext erhalten, erhält aber keine aktuelle Freigabe. Nachgeladene Ereignisse erscheinen nicht verspätet als neue Push Meldung.

„Bestätigt“ beschreibt die Chartbedingung. Es ist keine Empfehlung, den Trade auszuführen. Die Risikowarnungen bleiben separat sichtbar.

## Kosten und Rechengröße

Kosten je BTC = Entry × (2 × Gebühr je Seite + 2 × Slippage je Seite) / 10000.

Netto CRV = (erwarteter Abstand zum Modellziel minus Kosten) / (Abstand zur näheren Stopkante plus Kosten).

Modellgröße BTC = eingestelltes USD Modellrisiko / (Stopabstand plus Kosten).

Es findet keine Prüfung von Kontoguthaben, Margin, Produktverfügbarkeit, Prop Regeln oder realen Kraken Gebühren statt. Ein Short Hinweis beschreibt nur die Richtung; Spot BTC kann nicht automatisch leerverkauft werden. Das System sendet keine Order.

## Optionale Setups

Liquidity Sweep und VWAP Reclaim sind während des kontrollierten Neustarts vollständig gesperrt.

## Edge Analyst

Ein bestätigtes Signal gilt nicht automatisch als ausgeführter Modelltrade. Ein Entry wird nur angenommen, wenn das Open der nächsten Kerze innerhalb der gemeldeten Entry Zone liegt. Danach wird höchstens sechs Kerzen lang beobachtet, ob Ziel oder Stop zuerst erreicht wird. Liegen beide Marken innerhalb derselben OHLC Kerze, bleibt das Ergebnis unklar und fließt nicht als Sieg oder Verlust in die Statistik ein.

Aus abgeschlossenen Ergebnissen schätzt ein Jeffreys Beta Modell die Trefferwahrscheinlichkeit. Für jede Auswertung werden 10.000 reproduzierbare Ziehungen erzeugt und mit den beobachteten R Ergebnissen kombiniert. Angezeigt werden Erwartungswert, Profit Faktor, Wahrscheinlichkeit einer positiven Erwartung und Unsicherheitsbereiche. Unter dreißig auswertbaren Ergebnissen wird keine belastbare Edge Bewertung freigegeben. Wiederholte Ziehungen ersetzen keine neuen Marktdaten.

Jedes Ergebnis trägt eine aus Zeitrahmen, Profil und Kostenannahmen berechnete Strategieversion. Nach einer Parameteränderung bleiben frühere Resultate im Journal erhalten, werden aber nicht mit der neuen Version zu einer scheinbar größeren Stichprobe vermischt. Die aktive Edge Anzeige umfasst nur Ergebnisse der aktuell eingestellten Versionen.
