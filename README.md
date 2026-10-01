# Lohnzettel-Checker

Rechnet einen Lohnzettel (PDF, passwortgeschützt) im Browser nach: Bezugszeilen, Summe der Bezüge, SV-Basis, Sozialversicherung, Lohnsteuer-Basis, Sonderzahlungen, Abzüge und Auszahlung.

**Datenschutz:** Alles läuft lokal im Browser. Die PDF und das Passwort verlassen das Gerät nicht. Die Content-Security-Policy in `index.html` verbietet Verbindungen zu fremden Servern.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html`, `styles.css`, `app.js` | Oberfläche |
| `src/parser.js` | liest die Gehaltsseite aus den pdf.js-Text-Items (Spalten über die rechte Kante) |
| `src/pruefungen.js` | Rechenregeln der Gehaltsseite und SV-Sätze je Jahr (`SAETZE`) |
| `src/malerliste.js` | liest die Seiten „Lohnabrechnung Arbeiter" (eigene/Team-Abrechnungen, Versionen, Zuschläge) |
| `src/pruefungen-malerliste.js` | Prüfungen der Aufträge (Zeilen, Summen, Team-Anteil, Tagespauschale, Regiesatz) und Abgleich mit dem Monatslohn |
| `src/auswertung.js` | fügt alles für eine PDF zusammen (von App und Test gleich benutzt) |
| `vendor/pdfjs/` | pdf.js 4.10.38 (Apache 2.0), lokal eingebunden |
| `beispiel/muster-lohnzettel.pdf` | erfundener Zettel, Passwort `muster`, mit zwei absichtlichen Fehlern (Reisekosten-Zeile, geteilte Tagespauschale) |
| `tools/` | Entwickler-Werkzeuge (Node/Python), werden für die Seite nicht gebraucht |

## Lokal starten

```bash
python -m http.server 8765 --directory .
```

Dann http://localhost:8765 öffnen. Direkt als Datei (`file://`) geht es nicht, weil der PDF-Worker einen Webserver braucht.

## Testen gegen echte Zettel (nur am eigenen PC)

```bash
npm install
LOHN_PW=<passwort> node tools/test-lokal.mjs "<Ordner mit Lohnzetteln>"
```

Ausgabe: nur Monat und Prüfergebnis, keine persönlichen Daten.

## Wenn sich Sätze ändern

Neues Jahr mit anderen SV-Sätzen → in `src/pruefungen.js` bei `SAETZE` einen Eintrag für das Jahr ergänzen. Der Regiesatz wird pro Monat aus dem PDF gelesen (häufigster Stundensatz), nicht eingetragen. Die Tagespauschale (ab Juli 2026: 21,00 €/Std je Maler) steht in `src/pruefungen-malerliste.js` bei `TAGESPAUSCHALE`. Bei einem neuen Satz dort eine Zeile ergänzen.

## Regeln der Malerliste (aus 33 echten Zetteln abgeleitet)

- Zeile: Betrag = Satz × (Menge + 0,5 × Menge 50 % + 0,1 × Menge 10 %)
- Team-Abrechnung („A + B"): Anteil = (Summe − Tagespauschale) ÷ Anzahl Arbeiter + Tagespauschale. Die Tagespauschale steht jedem Maler voll zu und wird nie geteilt.
- Tagespauschale: 21,00 €/Std (ab Juli 2026), unabhängig vom Regiesatz. Ein anderer Satz wird als Fehler gemeldet.
- Eigene Abrechnung enthält Team-Anteile als Zeile „Anteil aus A+B". Ohne eigene Abrechnung zählen die Team-Anteile.
- Mehrere Versionen derselben Abrechnung: die neueste zählt; passt der Abgleich nur mit einer anderen Version, wird das gesagt.
- Abgleich: Summe aller Aufträge = Monatslohn (Pos. 135). Eine Differenz wird, wenn möglich, einem einzelnen Auftrag zugeordnet.
