// Wertet die Seiten EINER PDF aus: Gehaltsseite + Arbeiter-Abrechnungen.
// Wird von der App und vom Test-Werkzeug gleich benutzt.
import { istGehaltsseite, leseGehaltsseite } from "./parser.js";
import { pruefe, gesamtStatus } from "./pruefungen.js";
import { istArbeiterSeite, leseArbeiterSeite, fasseAbrechnungenZusammen } from "./malerliste.js";
import { pruefeMalerliste, auftragStatus } from "./pruefungen-malerliste.js";
import { ergaenzePreisverlauf } from "./preise.js";
import { pruefeGegenPreisliste } from "./preisliste.js";

// seitenZeilen: Array von Zeilen je Seite (aus zeilenAusItems)
export function werteAus(seitenZeilen) {
  let gehalt = null, doppelt = false;
  const arbeiterSeiten = [];
  for (const zeilen of seitenZeilen) {
    if (istGehaltsseite(zeilen)) {
      const g = leseGehaltsseite(zeilen);
      if (!gehalt) gehalt = g;
      else doppelt = true; // gleiche Gehaltsseite nochmal im PDF
    } else if (istArbeiterSeite(zeilen)) {
      arbeiterSeiten.push(leseArbeiterSeite(zeilen));
    }
  }
  if (!gehalt) return null;
  const pruefungen = pruefe(gehalt);
  const abrechnungen = fasseAbrechnungenZusammen(arbeiterSeiten.filter((s) => !s.monat || s.monat === gehalt.monat));
  const maler = pruefeMalerliste(abrechnungen, gehalt);
  return mitStatus({ ...gehalt, pruefungen, maler, doppelt });
}

function mitStatus(m) {
  for (const a of m.maler.auftraege) a.status = auftragStatus(a);
  m.status = gesamtStatus([...m.pruefungen, ...m.maler.abgleich, ...m.maler.auftraege.flatMap((a) => a.pruefungen)]);
  return m;
}

// Vergleicht die Akkordpreise mit früheren Monaten (aus dieser Auswahl und dem gespeicherten Verlauf).
// Gibt den neuen Verlauf zurück, den die App auf dem Gerät speichert.
export function pruefePreisverlauf(monate, verlauf) {
  const neu = ergaenzePreisverlauf(monate, verlauf);
  monate.forEach(mitStatus);
  return neu;
}

// Vergleicht die Akkordpreise mit der hochgeladenen Preisliste. Gibt { verglichen, ohne } zurück.
export function pruefePreisliste(monate, liste) {
  const summe = { verglichen: 0, ohne: 0 };
  for (const m of monate) {
    const r = pruefeGegenPreisliste(m, liste);
    summe.verglichen += r.verglichen;
    summe.ohne += r.ohne;
    mitStatus(m);
  }
  return summe;
}
