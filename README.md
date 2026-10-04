# Lohnzettel-Checker

Rechnet einen Lohnzettel (PDF, passwortgeschützt) im Browser nach: Bezugszeilen, Summe der Bezüge, SV-Basis, Sozialversicherung, Lohnsteuer-Basis, Sonderzahlungen, Abzüge und Auszahlung.

**Datenschutz:** Alles läuft lokal im Browser. Die PDF und das Passwort verlassen das Gerät nicht. Die Content-Security-Policy in `index.html` verbietet Verbindungen zu fremden Servern. Im Browser (`localStorage`) gespeichert werden nur der Preisverlauf (Arbeit + €-Satz je Monat, ohne Namen und Beträge) und, falls hochgeladen, die eigene Preisliste. Beides kann man in der App wieder löschen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html`, `styles.css`, `app.js` | Oberfläche |
| `src/parser.js` | liest die Gehaltsseite aus den pdf.js-Text-Items (Spalten über die rechte Kante) |
| `src/pruefungen.js` | Rechenregeln der Gehaltsseite und SV-Sätze je Jahr (`SAETZE`) |
| `src/malerliste.js` | liest die Seiten „Lohnabrechnung Arbeiter" (eigene/Team-Abrechnungen, Versionen, Zuschläge) |
| `src/pruefungen-malerliste.js` | Prüfungen der Aufträge (Zeilen, Summen, Team-Anteil, Tagespauschale, Regiesatz, Regie-Text mit m²-Preis) und Abgleich mit dem Monatslohn |
| `src/preise.js` | Preis-Plausibilität ohne Preisliste: gleiche Arbeit zu verschiedenen Preisen, Preis weicht vom üblichen Preis früherer Monate ab |
| `src/preisliste.js` | liest eine hochgeladene „Lohnpreisliste SUB“ (ArtNr, Einheit, Preis) und vergleicht jede Akkordposition damit. Enthält nur die Zuordnung Bezeichnung → ArtNr, **keine Preise** |
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

Mit Preisliste: zusätzlich `PREISLISTE="<Pfad zur Preisliste.pdf>"` setzen. `FEHLER_TEST=1` senkt testweise einen Preis, um zu sehen, ob die Abweichung erkannt wird.

Ausgabe: nur Monat und Prüfergebnis, keine persönlichen Daten.

## Wenn sich Sätze ändern

Neues Jahr mit anderen SV-Sätzen → in `src/pruefungen.js` bei `SAETZE` einen Eintrag für das Jahr ergänzen. Jedes Jahr (Jänner) außerdem die Grenzen für die verminderte Arbeitslosenversicherung bei `AV_GRENZEN` nachtragen (ÖGK „AV-Beitrag bei geringem Einkommen"). Bei geringem Monatsbezug sinkt die SV von 18,07 % auf 17,12 / 16,12 / 15,12 %. Der Regiesatz wird pro Monat aus dem PDF gelesen (häufigster Stundensatz), nicht eingetragen. Die Tagespauschale (ab Juli 2026: 21,00 €/Std je Maler) steht in `src/pruefungen-malerliste.js` bei `TAGESPAUSCHALE`. Bei einem neuen Satz dort eine Zeile ergänzen.

## Regeln der Malerliste (aus 33 echten Zetteln abgeleitet)

- Zeile: Betrag = Satz × (Menge + 0,5 × Menge 50 % + 0,1 × Menge 10 %)
- Team-Abrechnung („A + B"): Anteil = (Summe − Tagespauschale) ÷ Anzahl Arbeiter + Tagespauschale. Die Tagespauschale steht jedem Maler voll zu und wird nie geteilt.
- Tagespauschale: 21,00 €/Std (ab Juli 2026), unabhängig vom Regiesatz. Ein anderer Satz wird als Fehler gemeldet.
- Eigene Abrechnung enthält Team-Anteile als Zeile „Anteil aus A+B". Ohne eigene Abrechnung zählen die Team-Anteile.
- Mehrere Versionen derselben Abrechnung: die neueste zählt; passt der Abgleich nur mit einer anderen Version, wird das gesagt.
- Abgleich: Summe aller Aufträge = Monatslohn (Pos. 135). Eine Differenz wird, wenn möglich, einem einzelnen Auftrag zugeordnet.

## Preisprüfung

Es stehen bewusst **keine Firmenpreise im Code** (die Seite ist öffentlich, die Preise ändern sich und gehören der Firma).

**Ohne Preisliste** (immer aktiv):
- Zeile klingt nach Regie (Datum mit „>“, „inkl. FZ“, „Abdecken“, „Ausbesserung“), ist aber nach m²/Stk abgerechnet → Hinweis mit Vergleich zum Regiesatz
- Gleiche Arbeit im selben Monat zu verschiedenen Preisen → Hinweis
- Preis niedriger als der übliche Preis früherer Monate (mindestens 3 Belege) → Hinweis, höher → Info. Der Verlauf wird nur im Browser gespeichert, der Muster-Zettel nie.

**Mit Preisliste** (freiwillig, einmal hochladen):
- Jeder liest seine eigene „Lohnpreisliste SUB“ als PDF ein, sie bleibt im Browser gespeichert (grünes Häkchen in der App).
- Die Bezeichnungen auf den Abrechnungen sind freier Text. Zuordnung zur ArtNr in dieser Reihenfolge: (1) Bezeichnung steht genau so in der Liste, (2) Stichwort-Regel in `ZUORDNUNG` (`src/preisliste.js`, bisher für Maler), (3) Bezeichnung ohne Klammerzusatz („(Bad)“, „(WZ)“) steht in der Liste. Eine Regel ohne ArtNr bedeutet „Sonderfall, nicht vergleichen“.
- Staffelpreise („ab 100 m²“, „bis 9,99 m²“, Tapeten 1–5 / 6–24 / ab 25 Rollen) gelten alle als richtig, weil sich die Staffel auf den ganzen Auftrag beziehen kann. Bei einer Abweichung rechnet die App die Differenz zur Staffel, die zur Menge passt.
- Funktioniert für Maler und Bodenleger (geprüft mit der Bodenleger-Liste, 208 Artikel).
- Unter Listenpreis → Abweichung, über Listenpreis → Info, zwischen zwei Staffeln → Hinweis.
- Stunden (Regie, Tagespauschale) werden nicht mit der Liste verglichen, dafür gelten die eigenen Regeln oben. Sonderfälle (Nachverrechnung, „von 3x“, „Entfernen“ ohne eigene Listenposition) werden übersprungen.
- Neue Bezeichnungen oder eine andere Liste (z. B. Bodenleger): Regel in `ZUORDNUNG` ergänzen und mit `tools/test-lokal.mjs` + `PREISLISTE` prüfen.
