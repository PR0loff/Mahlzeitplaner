# Mahlzeitplaner

Wochenplaner für Mahlzeiten mit Rezepten von Chefkoch (nur Rezepte mit mindestens 4 Sternen und 20 Bewertungen).

## Funktionen
- Freie Wahl des Starttags der Woche
- Rezeptsuche und zufällige Vorschläge
- Einkaufsliste mit zusammengefassten Zutaten, nach Kategorien gegliedert
- Nährwerte pro Portion (wenn bei Chefkoch hinterlegt)
- Mehrere Gerichte pro Tag möglich
- Export: Zwischenablage, `.txt`, `.csv`, Druck, Notizen (Teilen-Menü für Apple Notizen / Samsung Notes) und Kalender (`.ics`)

## Starten
Voraussetzung: [Node.js](https://nodejs.org). Dann `start.bat` doppelklicken oder `node server.js` ausführen
und http://localhost:3000 öffnen. Der kleine Server leitet Chefkoch-Anfragen weiter (CORS).

## Dateien
- `index.html`, `style.css`, `app.js` – die Website
- `server.js` – lokaler Server und Proxy ohne Abhängigkeiten
