// Wertet die Seiten EINER PDF aus: Gehaltsseite + Arbeiter-Abrechnungen.
// Wird von der App und vom Test-Werkzeug gleich benutzt.
import { istGehaltsseite, leseGehaltsseite } from "./parser.js";
import { pruefe, gesamtStatus } from "./pruefungen.js";
import { istArbeiterSeite, leseArbeiterSeite, fasseAbrechnungenZusammen } from "./malerliste.js";
import { pruefeMalerliste } from "./pruefungen-malerliste.js";

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
  const alle = [...pruefungen, ...maler.abgleich, ...maler.auftraege.flatMap((a) => a.pruefungen)];
  return { ...gehalt, pruefungen, maler, doppelt, status: gesamtStatus(alle) };
}
