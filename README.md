# Lohnzettel-Checker

Rechnet einen Lohnzettel (PDF, passwortgeschützt) im Browser nach: Bezugszeilen, Summe der Bezüge, SV-Basis, Sozialversicherung, Lohnsteuer-Basis, Sonderzahlungen, Abzüge und Auszahlung.

**Datenschutz:** Alles läuft lokal im Browser. Die PDF und das Passwort verlassen das Gerät nicht. Die Content-Security-Policy in `index.html` verbietet Verbindungen zu fremden Servern. Im Browser (`localStorage`) gespeichert werden nur der Preisverlauf (Arbeit + €-Satz je Monat, ohne Namen und Beträge) und, falls hochgeladen, die eigene Preisliste. Auf Knopfdruck kommt ein Monatsprotokoll in die IndexedDB: nur Monat, Auftragsnummern, Abweichungen (Tätigkeit, Mengen, €) und Netto-Wirkung, **keine** Namen, Adressen, SV-Nummer oder IBAN. Alles kann man in der App wieder löschen. Zum Lesen gibt es „Verlauf drucken / als PDF“ (Druckfenster des Browsers, eigenes Drucklayout in styles.css), zur Sicherung „Sicherung speichern/laden“ (JSON, nur für die App).

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
| `src/arbeitsblatt.js` | liest die Arbeitsblätter (eingereichte Positionen, „+“ = nachgetragen, Zeitraum, zusätzliche Arbeiter, Fortsetzungsseiten) und die „Personalabrechnung Detailaufstellung“ (Urlaub, Krankenstand, Auslösen) |
| `src/abgleich.js` | Brutto-Check (Akkord = 135, Urlaub = 380/38x, Auslösen = 451), Positionsabgleich Arbeitsblatt ↔ Akkordabrechnung, Umbuchung im selben Auftrag, Netto-Wirkung |
| `src/protokoll.js` | Monatsprotokoll (nur erlaubte Felder) und IndexedDB-Speicher, Export/Import |
| `src/auswertung.js` | fügt alles für eine PDF zusammen (von App und Test gleich benutzt) |
| `vendor/pdfjs/` | pdf.js 4.10.38 (Apache 2.0), lokal eingebunden |
| `beispiel/muster-lohnzettel.pdf` | erfundener Zettel, Passwort `muster`, mit zwei absichtlichen Fehlern (Reisekosten-Zeile, geteilte Tagespauschale) |
| `tools/` | Entwickler-Werkzeuge (Node/Python), werden für die Seite nicht gebraucht |

## Lokal starten

```bash
python -m http.server 8765 --directory .
```

Dann http://localhost:8765 öffnen. Direkt als Datei (`file://`) geht es nicht, weil der PDF-Worker einen Webserver braucht.

## Neue Version veröffentlichen

Versionsnummer überall gleich erhöhen: `?v=…` in `index.html` (styles.css, app.js), bei **allen** Importen in `app.js` und `src/*.js` und in der Fußzeile. Sonst behalten Browser alte Programmteile im Zwischenspeicher und mischen alt und neu.

## Testen gegen echte Zettel (nur am eigenen PC)

```bash
npm install
LOHN_PW=<passwort> node tools/test-lokal.mjs "<Ordner mit Lohnzetteln>"
```

Mit Preisliste: zusätzlich `PREISLISTE="<Pfad zur Preisliste.pdf>"` setzen. `FEHLER_TEST=1` senkt testweise einen Preis, um zu sehen, ob die Abweichung erkannt wird.

Ausgabe: nur Monat und Prüfergebnis, keine persönlichen Daten.

Brutto-Check und Positionsabgleich: `LOHN_PW=<passwort> node tools/test-arbeitsblatt.mjs "<PDF oder Ordner>"`. Am echten Zettel geprüft: Akkord-Summe gegen Monatslohn (1 Cent Rundung = grün), gekürzte Regiestunde (−0,50 Std = −9,05 €), Umbuchung im selben Auftrag (Juli 2026), Team-Auftrag ÷ 2 Arbeiter. Der August-Zettel muss nach Änderungen gleich bleiben.

## Wenn sich Sätze ändern

Neues Jahr mit anderen SV-Sätzen → in `src/pruefungen.js` bei `SAETZE` einen Eintrag für das Jahr ergänzen. Jedes Jahr (Jänner) außerdem bei `SV_JAHR` die ÖGK-Werte nachtragen: AV-Staffel bei geringem Einkommen (SV sinkt dann von 18,07 % auf 17,12 / 16,12 / 15,12 %) und Höchstbeitragsgrundlage. Passt der Abzug nicht zum normalen Satz, sucht die App einen Sonderfall, der ihn genau erklärt, und zeigt ihn als Hinweis (AV-Entfall im Alter, halbe PV, Pensionist 2024/25, Lehrling, Wien). Den Schlechtwetterbeitrag (+0,7 %) bewusst nicht, er gilt nicht für Maler und Bodenleger. Quellen: ÖGK, WKO, AK-Broschüre „Meine Lohnabrechnung“. Test ohne echte Zettel: `node tools/test-sv.mjs`. Der Regiesatz wird pro Monat aus dem PDF gelesen (häufigster Stundensatz), nicht eingetragen. Die Tagespauschale (ab Juli 2026: 21,00 €/Std je Maler) steht in `src/pruefungen-malerliste.js` bei `TAGESPAUSCHALE`. Bei einem neuen Satz dort eine Zeile ergänzen.

## Regeln der Malerliste (aus 33 echten Zetteln abgeleitet)

- Zeile: Betrag = Satz × (Menge + 0,5 × Menge 50 % + 0,1 × Menge 10 %). Die 50-%-Spalte ist der Überstunden-Zuschlag, die 10-%-Spalte der Privatkunden-Zuschlag (Kunde zahlt selbst). Die App zeigt den Zuschlag als eigenen €-Betrag.
- Team-Abrechnung („A + B"): Anteil = (Summe − Tagespauschale) ÷ Anzahl Arbeiter + Tagespauschale. Die Tagespauschale steht jedem Maler voll zu und wird nie geteilt.
- Tagespauschale: 21,00 €/Std (ab Juli 2026), unabhängig vom Regiesatz. Ein anderer Satz wird als Fehler gemeldet.
- Eigene Abrechnung enthält Team-Anteile als Zeile „Anteil aus A+B". Ohne eigene Abrechnung zählen die Team-Anteile.
- Mehrere Versionen derselben Abrechnung: die neueste zählt; passt der Abgleich nur mit einer anderen Version, wird das gesagt.
- Abgleich: Summe aller Aufträge = Monatslohn (Pos. 135). Eine Differenz wird, wenn möglich, einem einzelnen Auftrag zugeordnet.

## Arbeitsblatt ↔ Abrechnung (ab 0.14)

- **Brutto-Check** unter der Brutto-Anzeige: Summe der Akkordabrechnungen = Lohnart 135; Urlaubstage der Detailaufstellung = Menge 380 (+ 381–389, z. B. Übersiedlungstag); Auslösen-Stunden = die 451-Zeile mit Satz „Prozent × Regiesatz“ (35 % von 18,10 € = 6,34 €). Bis 0,02 € = Rundung (grün). Farben überall nach Wirkung für dich: rot = zu deinem Nachteil, blau = zu deinen Gunsten, orange = unklar/selbst ansehen. Der Mail-Knopf erscheint nur bei Rotem oder bei „andere Einheit“ (falsch gebucht) und enthält nur diese Punkte, nie Blaues. Krankenstand wird nicht verglichen (410 mal in Tagen, mal in Stunden).
- **Positionsabgleich** je Auftrag: gleiche Tätigkeit (Text ohne Satzzeichen, Klammerzusätze und Mengenangaben) + Einheit, mehrere Zeilen (z. B. je Raum) zusammengezählt. Danach lockerer: ähnlicher Text, andere Einheit („umgerechnet“, z. B. Wasserflecken m² → Std), und bleibt je Seite genau eine Position übrig, gilt sie als umbenannt. Ergebnis: gestrichen, gekürzt (rot), erhöht, nicht im Blatt (orange), mit Differenz in Menge und € (bei Team-Abrechnung dein Anteil).
- **Umbuchung im selben Auftrag:** Danach werden je Auftrag die gekürzten/gestrichenen (Minus) und erhöhten/neuen Positionen (Plus) gegengerechnet: gleiche Einheit, zuerst mit gemeinsamem Stichwort (z. B. 100 m² „Leimfarbe abscheren“ → „Raufaserfarbe abscheren“). Ohne Stichwort nur, wenn es in der Einheit genau eine Kürzung und eine Erhöhung gibt (dann immer orange). Anzeige als eigene Zeile „umgebucht“ mit Menge und €-Differenz (Menge × jeweiliger Satz, bei Team dein Anteil): grün = Menge und € gleichen sich aus, orange = Menge gleich, aber anderer Preis (kommt bei weniger € auch in die Mail). Teilausgleich: der Rest bleibt rot. **Nie zwischen verschiedenen Aufträgen.** Test ohne echte Zettel: `node tools/test-umbuchung.mjs`.
- **Gleiche Fläche nur einmal (ab 0.16):** Ist eine Entfernungsarbeit (abscheren, entfernen, abwaschen, abbeizen, ablösen …) genau um die Menge einer anderen eingereichten Entfernungsarbeit im selben Auftrag gekürzt, gilt das als richtig (grün „gleiche Fläche“, ±0,00 €): dieselbe Fläche wird nur einmal bezahlt. Beispiel September 2026: 169,57 m² Leimfarbe abscheren + 60,47 m² Rauhfaseranstrich entfernen eingereicht, abgerechnet 109,10 m² Leimfarbe + 60,47 m² Raufaser. Nur bei genau gleicher Menge, sonst bleibt es rot.
- **Überscheren bei Abscheren (ab 0.17):** Wo abgeschert wird, zahlt das Lohnbüro „Überscheren und abkehren“ nicht extra. Ist Überscheren genau um die abgerechnete Fläche einer Abscher-Position (oder aller zusammen) im selben Auftrag gekürzt/gestrichen, ist das grün. An allen Zetteln 2024–2026 bestätigt (9 Fälle, z. B. Februar 2026). Andere Kürzungen von Überscheren bleiben rot.
- **Andere Einheit mit Satz aus anderen Monaten (ab 0.18):** Ist eine Position in einer anderen Einheit abgerechnet (z. B. Schimmelbehandlung 5 m² eingereicht, 0,50 Std abgerechnet) und gibt es im Monat keinen m²-Satz dafür, nimmt die App den üblichen Satz aus dem Preisverlauf (alle geladenen und am Gerät gespeicherten Monate, mindestens 2 Belege). Dann wird gerechnet statt „Bitte selbst ansehen“: Mai 2026 5 m² × 0,48 € = 2,40 €, bezahlt 9,05 € → +6,65 € zu deinen Gunsten (blau). Ohne Verlauf bleibt es orange.
- „Wenn notwendig Nikotinfarbe streichen!“ ist nur ein Farbhinweis zur Fläche von „Streichen - 2x weiß“ (Menge immer m², auch wenn „Std“ dabeisteht, Preis wie 2x weiß) und wird nicht als eigene Position verglichen. Steht Nikotinfarbe doch eigens in der Abrechnung, muss der Preis wie bei 2x weiß sein.
- Fahrtpauschale und Tagespauschale werden nicht verglichen, „- Anteil Kollege“-Zeilen auch nicht. Stehen dieselben Positionen auf eigener und Team-Abrechnung, zählen sie einmal.
- Arbeitsblatt mit Zeitraum im Vormonat: nur Info. Läuft der Zeitraum über den Monat hinaus, sind Kürzungen nur Info (Rest kommt vielleicht nächsten Monat). Mehr als 12 Std je Arbeiter und Tag = vermutlich Tippfehler im Blatt, zählt nicht zur Netto-Wirkung.
- Team-Aufträge: Aufteilung (Summe − Tagespauschale) ÷ Anzahl Arbeiter + Tagespauschale wird nachgerechnet und die Arbeiterzahl mit dem Arbeitsblatt (Arbeiter + Zusätzliche Arbeiter) verglichen.
- Ab 0.15 gibt es **keine** „Mögliche Umbuchung“ zwischen verschiedenen Aufträgen mehr. Was im Auftrag nicht ausgeglichen wird, bleibt rot. Alte gespeicherte Monatsprotokolle zeigen ihre Umbuchungen weiter an.
- Jedes rote/orange Feld zeigt beim Antippen die Erklärung, z. B. „Wand.- und Bodenfliesen abdecken: 2,00 Std eingereicht, 1,50 Std abgerechnet, −9,05 €“.

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
