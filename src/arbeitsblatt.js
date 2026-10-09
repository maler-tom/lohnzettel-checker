// Liest die Arbeitsblätter (vom Arbeiter eingereicht) und die "Personalabrechnung Detailaufstellung".
//
// Arbeitsblatt (Hochformat):
// - Kopf: "Arbeiter:", "Arbeitsauftrag: 10000001 - Maler(1)", "Adresse:", "Übermittelt am:"
// - Positionen: Tätigkeit (x ~57), Menge (rechtsbündig ~510), Einheit (~520). "+" vorne (x ~41)
//   oder hinter der Einheit (x ~549) = nachgetragen. Eingerückte Zeilen (x ~81) sind Notizen.
// - "Zeitraum (n Tage)" mit einem oder mehreren Datumsbereichen, danach "Zusätzliche Arbeiter".
// - Lange Blätter gehen weiter auf "Arbeitsblatt zu Auftrag 10000001 - Name   Seite: 2".
import { zahl, zeilenText } from "./parser.js?v=0.21";

const ZAHL = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
const DATUM = /(\d\d)\.(\d\d)\.(20\d\d)/g;
const MONATE = { JÄNNER: "01", JANUAR: "01", FEBRUAR: "02", MÄRZ: "03", APRIL: "04", MAI: "05", JUNI: "06", JULI: "07", AUGUST: "08", SEPTEMBER: "09", OKTOBER: "10", NOVEMBER: "11", DEZEMBER: "12" };

export function istArbeitsblatt(zeilen) {
  return zeilen.slice(0, 2).some((l) => /^Arbeitsblatt(\s+zu Auftrag|$)/.test(zeilenText(l)));
}

// "Adresse: Top 1,Musterstraße 5,4020 Linz" (kann in die nächste Zeile umbrechen) -> "Musterstraße 5, Linz".
// Nur zur Anzeige, damit man weiß, wo der Auftrag war. Wird nie gespeichert, gedruckt oder gemailt.
export function baustelle(texte) {
  const i = texte.findIndex((t) => /^Adresse:/.test(t));
  if (i < 0) return "";
  let roh = texte[i].replace(/^Adresse:\s*/, "");
  for (let j = i + 1; j < texte.length && !/^Übermittelt am:/.test(texte[j]); j++) roh += " " + texte[j].trim();
  const teile = roh.split(",").map((s) => s.trim()).filter(Boolean);
  const iPlz = teile.findIndex((s) => /^\d{4}\b/.test(s));
  const ort = iPlz >= 0 ? teile[iPlz].replace(/^\d{4}\s*/, "") : "";
  // Straße = letzter Teil vor der PLZ mit Wort + Hausnummer ("1. OG" oder "Top 1" überspringen)
  const vorPlz = iPlz >= 0 ? teile.slice(0, iPlz) : teile;
  const strasse = vorPlz.findLast((s) => /[A-Za-zÄÖÜäöüß]{4,}.*\d/.test(s)) ?? vorPlz.at(-1) ?? "";
  return [strasse, ort].filter(Boolean).join(", ");
}

export function leseArbeitsblatt(zeilen) {
  const texte = zeilen.map(zeilenText);
  const fortsetzung = texte.slice(0, 2).join(" ").match(/Arbeitsblatt zu Auftrag\s+(\d+)\s+-\s+(.+?)\s+Seite:\s*(\d+)/);
  const kopf = (re) => (texte.map((t) => t.match(re)).find(Boolean) || [])[1]?.trim() ?? "";
  const blatt = {
    auftrag: fortsetzung ? fortsetzung[1] : (kopf(/^Arbeitsauftrag:\s*(\d+)/) || null),
    arbeiter: fortsetzung ? fortsetzung[2].trim() : kopf(/^Arbeiter:\s*(.+)/),
    fortsetzung: !!fortsetzung, tage: null, ort: fortsetzung ? "" : baustelle(texte),
    positionen: [], daten: [], zusaetzlich: [],
  };

  // Bereiche: Kopf -> Positionen -> Zeitraum -> Zusätzliche Arbeiter -> Fußzeile
  let bereich = fortsetzung ? "positionen" : "kopf";
  for (let i = 0; i < zeilen.length; i++) {
    const t = texte[i], l = zeilen[i];
    if (/^Seite \d+ \| \d+/.test(t)) break;
    if (bereich === "kopf") { if (/^Übermittelt am:/.test(t)) bereich = "positionen"; continue; }
    if (/^Zeitraum\b/.test(t)) { bereich = "zeitraum"; blatt.tage = +((t.match(/\((\d+)\s*Tag/) || [])[1] ?? 0) || null; continue; }
    if (/^Zusätzliche Arbeiter/.test(t)) { bereich = "arbeiter"; continue; }
    if (bereich === "zeitraum") { for (const d of t.matchAll(DATUM)) blatt.daten.push(`${d[3]}-${d[2]}-${d[1]}`); continue; }
    if (bereich === "arbeiter") { blatt.zusaetzlich.push(t.trim()); continue; }

    // Positionszeile: Zahl in der Mengen-Spalte + Einheit dahinter
    const iZahl = l.zellen.findIndex((z) => z.x > 400 && z.x < 515 && ZAHL.test(z.text));
    if (iZahl < 0) continue; // Überschrift (Raum), Notiz oder Umbruch -> zählt nicht
    const einheit = l.zellen[iZahl + 1]?.text ?? "";
    const name = l.zellen.filter((z) => z.x >= 50 && z.x < 400).map((z) => z.text).join(" ").trim();
    if (!name) continue;
    blatt.positionen.push({ name, menge: zahl(l.zellen[iZahl].text), einheit, plus: l.zellen.some((z) => z.text === "+" && (z.x < 50 || z.x > 540)) });
  }
  blatt.daten.sort();
  return blatt;
}

// Fortsetzungsseiten an das Blatt davor hängen, doppelte Blätter nur einmal zählen
export function fasseArbeitsblaetterZusammen(seiten) {
  const blaetter = [], gesehen = new Set();
  for (const s of seiten) {
    const vorige = blaetter.findLast((b) => b.auftrag === s.auftrag);
    if (s.fortsetzung && vorige) {
      vorige.positionen.push(...s.positionen);
      vorige.daten.push(...s.daten);
      vorige.daten.sort();
      vorige.zusaetzlich.push(...s.zusaetzlich);
      vorige.tage ??= s.tage;
      continue;
    }
    blaetter.push({ ...s, positionen: [...s.positionen], daten: [...s.daten], zusaetzlich: [...s.zusaetzlich] });
  }
  return blaetter.filter((b) => {
    const k = JSON.stringify([b.auftrag, b.arbeiter, b.positionen, b.daten]);
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });
}

// ---------- Personalabrechnung Detailaufstellung ----------
// Art (x ~45) | Datum (~173–190) | Wert (rechte Kante ~307) | Bemerkung (~318, z. B. "Auftrag 10000001, 08.30-09.45h")

export const istDetailaufstellung = (zeilen) => zeilen.slice(0, 3).some((l) => /Personalabrechnung Detailaufstellung/.test(zeilenText(l)));

// Mehrere Seiten: die Art läuft über den Seitenwechsel weiter
export function leseDetailaufstellung(seiten) {
  const eintraege = [];
  let monat = null, art = null;
  for (const zeilen of seiten) {
    for (const l of zeilen) {
      const t = zeilenText(l);
      const m = t.match(/Detailaufstellung\s+((?:[A-ZÄÖÜ]\s*)+?)\s*(20\d\d)/);
      if (m) {
        const mon = MONATE[m[1].replace(/\s+/g, "")];
        if (mon) monat ??= `${m[2]}-${mon}`;
        continue;
      }
      if (/^(Art\b|Gedruckt|Fa\.|Gesamt:)/.test(t) || l.zellen.some((z) => /^Gesamt:/.test(z.text))) continue;
      const erste = l.zellen[0];
      if (erste.x < 100 && !/^\d/.test(erste.text) && !/^[A-ZÄÖÜ]+ /.test(erste.text)) art = erste.text;
      const wert = l.zellen.find((z) => z.x > 260 && z.x < 300 && ZAHL.test(z.text));
      if (!art || !wert) continue;
      const datum = l.zellen.find((z) => z.x > 150 && z.x < 260)?.text ?? "";
      const bemerkung = l.zellen.filter((z) => z.x > 310).map((z) => z.text).join(" ");
      eintraege.push({ art, datum, wert: zahl(wert.text), auftrag: (bemerkung.match(/Auftrag\s+(\d+)/) || [])[1] ?? null });
    }
  }
  const summe = (re) => Math.round(eintraege.filter((e) => re.test(e.art)).reduce((s, e) => s + e.wert, 0) * 100) / 100;
  const prozent = +((eintraege.find((e) => /^Auslösen/.test(e.art))?.art.match(/(\d+)\s*%/) || [])[1] ?? 0) || null;
  return { monat, eintraege, urlaub: summe(/^Urlaub/), krank: summe(/^Krank/), ausloesen: summe(/^Auslösen/), ausloesenProzent: prozent };
}
