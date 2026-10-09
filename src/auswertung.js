// Wertet die Seiten EINER PDF aus: Gehaltsseite + Arbeiter-Abrechnungen.
// Wird von der App und vom Test-Werkzeug gleich benutzt.
import { istGehaltsseite, leseGehaltsseite } from "./parser.js?v=0.15";
import { pruefe, gesamtStatus } from "./pruefungen.js?v=0.15";
import { istArbeiterSeite, leseArbeiterSeite, fasseAbrechnungenZusammen } from "./malerliste.js?v=0.15";
import { pruefeMalerliste, auftragStatus } from "./pruefungen-malerliste.js?v=0.15";
import { ergaenzePreisverlauf } from "./preise.js?v=0.15";
import { pruefeGegenPreisliste } from "./preisliste.js?v=0.15";
import { istArbeitsblatt, leseArbeitsblatt, fasseArbeitsblaetterZusammen, istDetailaufstellung, leseDetailaufstellung } from "./arbeitsblatt.js?v=0.15";
import { bruttoCheck, positionsAbgleich, nettoWirkung } from "./abgleich.js?v=0.15";

// seitenZeilen: Array von Zeilen je Seite (aus zeilenAusItems)
export function werteAus(seitenZeilen) {
  let gehalt = null, doppelt = false;
  const arbeiterSeiten = [], blattSeiten = [], detailSeiten = [];
  for (const zeilen of seitenZeilen) {
    if (istArbeitsblatt(zeilen)) blattSeiten.push(leseArbeitsblatt(zeilen));
    else if (istDetailaufstellung(zeilen)) detailSeiten.push(zeilen);
    else if (istGehaltsseite(zeilen)) {
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
  const detail = detailSeiten.length ? leseDetailaufstellung(detailSeiten) : null;
  const brutto = bruttoCheck(gehalt, maler, detail);
  const arbeitsblatt = arbeitsblattAbgleich(fasseArbeitsblaetterZusammen(blattSeiten), maler, gehalt.monat);
  // Brutto-Check zählt fürs Gesamtergebnis und die Mail, angezeigt wird er aber nur im aufklappbaren Brutto-Check.
  // "Aufträge = Monatslohn" aus dem Abgleich der Aufträge ist dieselbe Prüfung: deren Erklärung kommt in die Brutto-Zeile.
  const akkordZeile = maler.auftraege.length ? brutto[0] : null;
  for (const x of maler.abgleich)
    if (akkordZeile && /Monatslohn|ausbezahlt als abgerechnet/.test(x.titel)) {
      x.bereich = "brutto";
      x.status = akkordZeile.status;
      x.euro = akkordZeile.euro; // gleiche Farbe wie im Brutto-Check (mehr bezahlt = blau)
      const erklaerung = x.text.match(/(Das entspricht|Der Betrag passt).*$/);
      if (akkordZeile.status !== "ok" && erklaerung) akkordZeile.text += ` ${erklaerung[0]}`;
    }
  for (const z of brutto.slice(akkordZeile ? 1 : 0)) if (z.status !== "ok") pruefungen.push({ status: z.status, titel: z.titel, text: z.text, euro: z.euro, bereich: "brutto" });
  return mitStatus({ ...gehalt, pruefungen, maler, doppelt, detail, brutto, arbeitsblatt });
}

// Arbeitsblätter mit den Akkordabrechnungen vergleichen. Abweichungen landen auch bei den Prüfungen der Aufträge (Status, Mail).
function arbeitsblattAbgleich(blaetter, maler, monat) {
  if (!blaetter.length) return null;
  const abgleich = positionsAbgleich(blaetter, maler, monat);
  const WORT = { gestrichen: "gestrichen", gekürzt: "gekürzt", erhöht: "erhöht", neu: "nicht im Arbeitsblatt", umgerechnet: "andere Einheit", umgebucht: "umgebucht" };
  for (const a of abgleich) {
    const auf = maler.auftraege.find((x) => x.auftrag === a.auftrag);
    const ziel = auf ? auf.pruefungen : maler.abgleich;
    const vor = auf ? "" : `Arbeitsblatt ${a.auftrag}: `;
    // Ganz ausgeglichene Positionen nicht extra melden, die Umbuchungszeile sagt alles
    for (const z of a.zeilen.filter((x) => (x.status !== "ok" || x.umbuchung) && !x.ausgeglichen))
      ziel.push({ status: z.status, titel: `${vor}${z.name}: ${WORT[z.art]}`, text: z.erklaerung, euro: z.euroDein, art: z.art, bereich: "arbeitsblatt", sprung: { auftrag: a.auftrag, name: z.name } });
    for (const h of a.hinweise) ziel.push({ status: h.status, titel: `${vor}Arbeitsblatt`, text: h.text, bereich: "arbeitsblatt", sprung: { auftrag: a.auftrag } });
    if (auf && a.zeilen.length && a.zeilen.every((x) => x.status === "ok" && x.art !== "umgebucht"))
      auf.pruefungen.push({ status: "ok", titel: "Arbeitsblatt", text: `Alle ${a.zeilen.length} Positionen wie eingereicht abgerechnet.`, bereich: "arbeitsblatt" });
  }
  // umbuchungen bleibt leer: keine Gegenrechnung zwischen Aufträgen (alte Protokolle können noch welche haben)
  return { abgleich, umbuchungen: [], netto: nettoWirkung(abgleich) };
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
