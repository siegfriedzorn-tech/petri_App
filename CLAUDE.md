# Petri – Angelführer

PWA (Progressive Web App) auf Deutsch. Berechnet einen "Fang-Score" für Angler
aus Wetterdaten, Mondphase, Luftdruck und Forumsberichten. Zielfische: Zander,
Hecht, Barsch, Forelle.

## Aufbau

Eine einzelne Datei, kein Build-Prozess, keine Dependencies außer Leaflet per CDN.

- `index.html` – die gesamte App (~3.500 Zeilen: HTML, CSS, JS in einer Datei)
- `manifest.json` – PWA-Manifest
- `sw.js` – Service Worker (Cache-first für App-Shell, Network-first für APIs)
- `icon-192.png`, `icon-512.png`, `icon-192.svg`, `icon-512.svg` – App-Icons

Zum Testen: Datei im Browser öffnen, oder `python3 -m http.server 8000`
(Service Worker braucht http://, funktioniert nicht über file://).

## Screens

Sechs Screens, umgeschaltet über `goTo(name)` per CSS-Klasse `.active`:
`home`, `baits` (Köder), `map` (Karte), `diary` (Fangbuch), `forecast`
(Vorhersage), `settings`.

## Externe Dienste

- **Open-Meteo** – Wetter und Wasserwerte, kein API-Key nötig
- **PegelOnline (WSV)** – Pegelstände deutscher Gewässer, kein Key
- **OpenStreetMap** – Kartenkacheln via Leaflet 1.9.4 (CDN)
- **Anthropic API** – optionaler Forum-Sync; der Nutzer hinterlegt seinen
  eigenen Key, gespeichert in `localStorage` unter `petri_api_key`

## localStorage-Schlüssel

- `petri_api_key` – Anthropic-Key des Nutzers
- `petri_catches` – Fangbuch-Einträge
- `petri_weight_forum` – Gewichtung Wetter vs. Forum (Slider)
- `petri_sync_cache` – Forum-Sync-Ergebnisse, 24 h gültig

## Konventionen

- Sprache im UI und in Kommentaren: Deutsch
- Farben und Abstände über CSS-Variablen: `--accent`, `--bg-card`,
  `--bg-elevated`, `--text-pri`, `--text-sec`, `--text-muted`, `--border`
- Kein Framework, kein npm, kein Bundler – bitte auch keins einführen
- Zielgerät ist das Handy; alles muss mit Daumenbedienung funktionieren

## Bekannte Baustellen

1. `STATIC_ASSETS` in `sw.js` mischt lokale Dateien mit drei CDN-URLs.
   `cache.addAll()` ist atomar: ist eine CDN-URL beim Install nicht
   erreichbar, bleibt der gesamte App-Shell-Cache leer. Der Fehler landet
   nur in einem `console.warn`, die App wirkt normal – bis man offline geht.
2. `loadForecast()` ist zweimal definiert. Die zweite Definition gewinnt.
   Der gesamte Block davor ist toter Code: `fetchForecast`,
   `computeHourlyScore`, `getFishDepth`, `renderSwarmData`.
3. Im `<head>` stehen zwei Mobile-Fix-Skripte, die sich widersprechen
   (`position:fixed` vs. `position:static`). Beide hängen am resize-Event.
4. Über 500 Inline-Styles im HTML. Blockiert jede zentrale Designänderung,
   weil Farben und Abstände nicht in Klassen liegen.

## Arbeitsweise

Kleine Schritte, nach jedem ein Commit. Nach jeder Änderung im Browser
gegenprüfen, dass alle sechs Screens noch laden und die Konsole fehlerfrei ist.
