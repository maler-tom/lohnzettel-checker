// Preis-Plausibilität ohne Preisliste: Es stehen keine Firmenpreise im Code.
// - gleicheArbeitAndererPreis: dieselbe Arbeit im selben Monat zu verschiedenen Preisen
// - ergaenzePreisverlauf: Preis weicht vom üblichen Preis früherer Monate ab
//   (die früheren Preise merkt sich nur das eigene Gerät, siehe app.js)
import { euro } from "./pruefungen.js?v=0.20";

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const menge = (x) => x.toLocaleString("de-DE", { maximumFractionDigits: 2 });
// Mindestanzahl früherer Belege, bevor ein Preis als "üblich" gilt
const MIN_BELEGE = 3;

// "Spachteln - 2x (Bad)" und "spachteln 2x bad" sind dieselbe Arbeit
export const preisSchluessel = (pos) =>
  `${pos.name.toLowerCase().replace(/[()\-–>/.,:;+]/g, " ").replace(/\s+/g, " ").trim()}|${pos.einheit}`;

// Nur Akkord-Positionen: Stunden haben eigene Regeln (Regiesatz, Zuschläge, Tagespauschale)
const istAkkord = (pos) => !pos.anteilAus && pos.einheit && pos.einheit !== "Std" && pos.satz > 0 && pos.menge != null;

function* akkordPositionen(auftraege) {
  for (const auf of auftraege)
    for (const a of auf.abrechnungen)
      for (const pos of a.positionen) if (istAkkord(pos)) yield { auf, pos };
}

export function gleicheArbeitAndererPreis(auftraege) {
  const gruppen = new Map();
  for (const { auf, pos } of akkordPositionen(auftraege)) {
    const k = preisSchluessel(pos);
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push({ auf, pos });
  }
  for (const liste of gruppen.values()) {
    const saetze = [...new Set(liste.map((x) => x.pos.satz))].sort((a, b) => a - b);
    if (saetze.length < 2) continue;
    const text = `„${liste[0].pos.name}“ ist diesen Monat zu ${saetze.map((s) => `${euro(s)}/${liste[0].pos.einheit}`).join(" und ")} abgerechnet (Aufträge ${[...new Set(liste.map((x) => x.auf.auftrag))].join(", ")}). Ist der niedrigere Preis richtig?`;
    for (const auf of new Set(liste.map((x) => x.auf)))
      auf.pruefungen.push({ status: "hinweis", titel: `${liste[0].pos.name}: verschiedene Preise`, text });
  }
}

// Preise eines Monats für den Verlauf: { schluessel: [satz, satz, ...] }
export function preiseDesMonats(m) {
  const p = {};
  for (const { pos } of akkordPositionen(m.maler.auftraege)) (p[preisSchluessel(pos)] ??= []).push(pos.satz);
  return p;
}

// verlauf: { "2026-05": { schluessel: [satz, ...] }, ... } (frühere Monate, auch aus dem Gerätespeicher)
// Vergleicht jeden Monat mit allen Monaten davor. Gibt den ergänzten Verlauf zurück.
export function ergaenzePreisverlauf(monate, verlauf = {}) {
  const alle = { ...verlauf };
  for (const m of monate) if (m.monat) alle[m.monat] = preiseDesMonats(m);

  for (const m of monate) {
    if (!m.monat) continue;
    const frueher = new Map();
    for (const [monat, preise] of Object.entries(alle)) {
      if (monat >= m.monat) continue;
      for (const [k, saetze] of Object.entries(preise)) {
        if (!frueher.has(k)) frueher.set(k, new Map());
        for (const s of saetze) frueher.get(k).set(s, (frueher.get(k).get(s) ?? 0) + 1);
      }
    }
    const gemeldet = new Set();
    for (const { auf, pos } of akkordPositionen(m.maler.auftraege)) {
      const zaehl = frueher.get(preisSchluessel(pos));
      if (!zaehl) continue;
      const [ueblich, anzahl] = [...zaehl.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
      if (anzahl < MIN_BELEGE || Math.abs(pos.satz - ueblich) < 0.005) continue;
      const k = `${auf.auftrag}|${preisSchluessel(pos)}|${pos.satz}`;
      if (gemeldet.has(k)) continue;
      gemeldet.add(k);
      const diff = r2(Math.abs(ueblich - pos.satz) * pos.menge);
      const basis = `${euro(pos.satz)}/${pos.einheit}, in früheren Monaten meistens ${euro(ueblich)}/${pos.einheit} (${anzahl}×).`;
      if (pos.satz < ueblich)
        auf.pruefungen.push({ status: "hinweis", titel: `${pos.name}: niedriger als sonst`, text: `${basis} Bei ${menge(pos.menge)} ${pos.einheit} sind das ${euro(diff)} weniger. Bitte prüfen, ob der Preis stimmt.` });
      else
        auf.pruefungen.push({ status: "info", titel: `${pos.name}: höher als sonst`, text: `${basis} Das sind ${euro(diff)} mehr als üblich.` });
    }
  }
  return alle;
}
