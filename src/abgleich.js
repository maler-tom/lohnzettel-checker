// Brutto-Check (Akkord, Urlaub, Auslösen) und Positionsabgleich Arbeitsblatt ↔ Akkordabrechnung.
import { euro } from "./pruefungen.js?v=0.19";

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const RUNDUNG = 0.02; // bis 2 Cent = Rundung
export const menge = (x) => x.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const vorzeichenEuro = (x) => (Math.abs(x) < 0.005 ? "±0,00 €" : `${x > 0 ? "+" : "−"}${euro(Math.abs(x))}`);
const vzMenge = (x) => `${x > 0 ? "+" : "−"}${menge(Math.abs(x))}`;

// ---------- 1. Brutto-Check ----------
// Menge × Satz = Betrag? Der Satz ist am Zettel auf Cent gerundet gedruckt (z. B. 18,97 statt 18,9689 €),
// darum darf die Rechnung um einen halben Cent je Menge abweichen.
const rechnetFalsch = (b) => Math.abs(r2(b.menge * b.satz) - b.betrag) > Math.max(RUNDUNG, Math.abs(b.menge) * 0.005 + 0.005);
// Lohnarten: 135 Monatslohn, 380 Urlaubsentgelt (+ 381–389 z. B. Übersiedlungstag), 451 Reisekostenverg. pauschal.
// Auslösen steht als eigene 451-Zeile mit dem Satz "Prozent × Regiesatz" (35 % von 18,10 € = 6,34 €).
export function bruttoCheck(gehalt, maler, detail) {
  const zeilen = [];
  // fuerDich: Differenz aus deiner Sicht (+ = mehr bezahlt). Bis 2 Cent = Rundung (grün), zu wenig = rot, mehr = blau ("plus")
  const status = (fuerDich) => (Math.abs(fuerDich) <= RUNDUNG ? "ok" : fuerDich < 0 ? "fehler" : "plus");
  const wirkung = (fuerDich) => (Math.abs(fuerDich) <= RUNDUNG ? "." : fuerDich < 0 ? `. Differenz ${vorzeichenEuro(fuerDich)}: zu wenig bezahlt.` : `. Differenz ${vorzeichenEuro(fuerDich)} zu deinen Gunsten (mehr bezahlt). Kurz nachfragen, woher das kommt, damit es nicht später abgezogen wird.`);
  const add = (titel, fuerDich, wert, text) => zeilen.push({ titel, status: status(fuerDich), wert, text, euro: r2(fuerDich) });

  if (maler.auftraege.length) {
    const diff = r2(maler.summe - maler.lohn);
    add("Akkord = Monatslohn (135)", -diff, `${euro(maler.summe)} / ${euro(maler.lohn)}`,
      `Die ${maler.auftraege.length} Akkordabrechnungen ergeben zusammen ${euro(maler.summe)}, als Monatslohn (Lohnart 135) stehen ${euro(maler.lohn)} am Zettel.` +
      (!diff ? " Genau gleich." : Math.abs(diff) <= RUNDUNG ? ` Differenz ${euro(Math.abs(diff))} = Rundung.` : wirkung(-diff).slice(1)));
  }
  if (!detail) return zeilen;

  // Urlaub
  const urlaubZeilen = gehalt.bezuege.filter((b) => /^38\d$/.test(b.code));
  if (detail.urlaub || urlaubZeilen.length) {
    const bezahlt = r2(urlaubZeilen.reduce((s, b) => s + (b.menge ?? 0), 0));
    const satz = urlaubZeilen.find((b) => b.code === "380")?.satz ?? urlaubZeilen[0]?.satz ?? 0;
    const diffEuro = r2((bezahlt - detail.urlaub) * satz);
    add("Urlaubsentgelt (380)", diffEuro, `${menge(bezahlt)} / ${menge(detail.urlaub)} Tage`,
      `Laut Detailaufstellung ${menge(detail.urlaub)} Urlaubstage, auf dem Lohnzettel ${menge(bezahlt)} Tage` +
      (urlaubZeilen.length ? ` (${urlaubZeilen.map((b) => `${b.code} ${b.name}: ${menge(b.menge ?? 0)} × ${euro(b.satz)} = ${euro(b.betrag)}`).join("; ")})` : "") +
      wirkung(diffEuro));
    for (const b of urlaubZeilen)
      if (b.menge != null && b.satz != null && rechnetFalsch(b))
        add(`${b.name}: Rechnung`, r2(b.betrag - b.menge * b.satz), euro(b.betrag), `${menge(b.menge)} × ${euro(b.satz)} ergibt ${euro(r2(b.menge * b.satz))}, am Zettel stehen ${euro(b.betrag)}.`);
  }

  // Krankenstand (410 Krankenentgelt). Meist in Tagen mit dem gleichen Tagessatz wie das Urlaubsentgelt,
  // manchmal in Stunden (z. B. 4 Tage = 31,50 Std × Stundensatz). Geprüft an echten Zetteln 2024–2026.
  const krankZeilen = gehalt.bezuege.filter((b) => /^41\d$/.test(b.code) && b.menge != null && b.satz != null);
  if (detail.krank || krankZeilen.length) {
    const titel = "Krankenentgelt (410)";
    const liste = krankZeilen.map((b) => `${b.code} ${b.name}: ${menge(b.menge)} × ${euro(b.satz)} = ${euro(b.betrag)}`).join("; ");
    const inTagen = krankZeilen.length && krankZeilen.every((b) => b.satz >= 50);
    if (!krankZeilen.length)
      add(titel, -1, `0 / ${menge(detail.krank)} Tage`, `Laut Detailaufstellung ${menge(detail.krank)} Krankentage, auf dem Lohnzettel ist kein Krankenentgelt (410). Bei langem Krankenstand kann das am Krankengeld der ÖGK liegen, sonst nachfragen.`);
    else if (!detail.krank)
      zeilen.push({ titel, status: "hinweis", wert: liste, text: `Krankenentgelt am Lohnzettel (${liste}), aber in der Detailaufstellung steht kein Krankenstand. Bitte selbst ansehen.`, euro: 0 });
    else if (inTagen) {
      const bezahlt = r2(krankZeilen.reduce((s, b) => s + b.menge, 0)), satz = krankZeilen[0].satz;
      const diffEuro = r2((bezahlt - detail.krank) * satz);
      add(titel, diffEuro, `${menge(bezahlt)} / ${menge(detail.krank)} Tage`, `Laut Detailaufstellung ${menge(detail.krank)} Krankentage, auf dem Lohnzettel ${menge(bezahlt)} Tage (${liste})` + wirkung(diffEuro));
      const urlaubSatz = urlaubZeilen.find((b) => b.code === "380")?.satz;
      if (urlaubSatz && Math.abs(urlaubSatz - satz) > 0.011)
        add("Krankenentgelt: Tagessatz", r2((satz - urlaubSatz) * bezahlt), `${euro(satz)} / ${euro(urlaubSatz)}`, `Der Krankenstand ist mit ${euro(satz)} pro Tag abgerechnet, das Urlaubsentgelt im selben Monat mit ${euro(urlaubSatz)}. Normal sind beide gleich (Durchschnitt der letzten Wochen).`);
    } else {
      const stunden = r2(krankZeilen.reduce((s, b) => s + b.menge, 0)), proTag = stunden / detail.krank;
      const plausibel = proTag >= 6 && proTag <= 9;
      zeilen.push({ titel, status: plausibel ? "ok" : "hinweis", wert: `${menge(stunden)} Std / ${menge(detail.krank)} Tage`, euro: 0,
        text: `Laut Detailaufstellung ${menge(detail.krank)} Krankentage, abgerechnet in Stunden (${liste}), das sind ${menge(proTag)} Std pro Tag.` +
          (plausibel ? " Passt zu einem normalen Arbeitstag." : " Das passt nicht zu einem normalen Arbeitstag (6–9 Std). Bitte selbst ansehen.") });
    }
    for (const b of krankZeilen)
      if (rechnetFalsch(b))
        add(`${b.name}: Rechnung`, r2(b.betrag - b.menge * b.satz), euro(b.betrag), `${menge(b.menge)} × ${euro(b.satz)} ergibt ${euro(r2(b.menge * b.satz))}, am Zettel stehen ${euro(b.betrag)}.`);
  }

  // Auslösen
  const z451 = gehalt.bezuege.filter((b) => b.code === "451" && b.menge != null && b.satz != null);
  const sollSatz = detail.ausloesenProzent && maler.regiesatz ? r2(maler.regiesatz * detail.ausloesenProzent / 100) : null;
  const ausl = z451.find((b) => sollSatz && Math.abs(b.satz - sollSatz) <= 0.011)
    ?? z451.find((b) => Math.abs(b.menge - detail.ausloesen) < 0.005 && b.satz > 3)
    ?? (detail.ausloesen ? z451.filter((b) => b.satz > 3).sort((a, b) => b.satz - a.satz)[0] : null);
  if (detail.ausloesen || ausl) {
    const bezahlt = ausl?.menge ?? 0, satz = ausl?.satz ?? sollSatz ?? 0;
    const diffEuro = r2((bezahlt - detail.ausloesen) * satz);
    const tage = detail.eintraege.filter((e) => /^Auslösen/.test(e.art)).length;
    add(`Auslösen ${detail.ausloesenProzent ?? ""}%`.trim(), diffEuro, `${menge(bezahlt)} / ${menge(detail.ausloesen)} Std`,
      `Laut Detailaufstellung ${menge(detail.ausloesen)} Std Auslösen (${tage} ${tage === 1 ? "Eintrag" : "Einträge"}), ` +
      (ausl ? `auf dem Lohnzettel (451) ${menge(bezahlt)} Std × ${euro(satz)} = ${euro(ausl.betrag)}` : "auf dem Lohnzettel keine passende Zeile 451") +
      wirkung(diffEuro));
    if (ausl && rechnetFalsch(ausl))
      add("Auslösen: Rechnung", r2(ausl.betrag - ausl.menge * ausl.satz), euro(ausl.betrag), `${menge(ausl.menge)} × ${euro(ausl.satz)} ergibt ${euro(r2(ausl.menge * ausl.satz))}, am Zettel stehen ${euro(ausl.betrag)}.`);
  }
  return zeilen;
}

// ---------- 2. Positionsabgleich ----------
// Gleiche Tätigkeit = gleicher Text (ohne Satzzeichen/Groß-Klein) + gleiche Einheit.
// Mehrere Zeilen derselben Tätigkeit (z. B. je Raum) werden je Auftrag zusammengezählt.
const norm = (s) => s.toLowerCase().replace(/ß/g, "ss").replace(/[^a-z0-9äöü]+/g, "");
const woerter = (s) => new Set(s.toLowerCase().split(/[^a-z0-9äöüß]+/).filter((w) => w.length > 2));
const OHNE_ABGLEICH = /Fahrtpauschale|Tagespauschale/i;
// "Wenn notwendig Nikotinfarbe streichen!" ist nur ein Hinweis, welche Farbe auf die Fläche von
// "Streichen - 2x weiß" kommt (Menge = m², auch wenn "Std" dabeisteht). Preis wie 2x weiß, keine eigene Position.
const NIKOTIN = /Nikotin/i;
const ZWEIMAL_WEISS = /Streichen\s*-?\s*2\s*x\s*wei/i;

// Für den Textvergleich: Klammerzusätze "(0,50h)" und Mengenangaben "35m²" weg
const kern = (s) => norm(s.replace(/\([^)]*\)/g, " ").replace(/\S*\d\S*/g, " "));
// "x" und "Stk" sind dieselbe Einheit (Heizkörper); fehlende Einheit passt zu allem
const einheitNorm = (e) => (e === "x" ? "Stk" : e);
const gleicheEinheit = (a, b) => !a.einheit || !b.einheit || einheitNorm(a.einheit) === einheitNorm(b.einheit);
const gemeinsamesWort = (a, b) => { const wb = woerter(b); return [...woerter(a)].some((w) => w.length >= 5 && wb.has(w)); };

function aehnlich(a, b) {
  if (kern(a) && kern(a) === kern(b)) return true;
  const na = kern(a), nb = kern(b);
  if (Math.min(na.length, nb.length) >= 6 && (na.startsWith(nb) || nb.startsWith(na))) return true;
  const wa = woerter(a), wb = woerter(b);
  const gemeinsam = [...wa].filter((w) => wb.has(w)).length;
  return gemeinsam >= 2 && gemeinsam / Math.max(wa.size, wb.size) >= 0.6;
}

function sammle(eintraege) {
  const map = new Map();
  for (const e of eintraege) {
    const k = `${norm(e.name)}|${einheitNorm(e.einheit)}`;
    if (!map.has(k)) map.set(k, { ...e, menge: 0, betrag: 0, plus: false });
    const s = map.get(k);
    s.menge = r2(s.menge + e.menge);
    s.betrag = r2(s.betrag + (e.betrag ?? 0));
    s.plus ||= !!e.plus;
  }
  return [...map.values()];
}

const monatsAnfang = (monat) => `${monat}-01`;
const naechsterMonat = (monat) => {
  const [j, m] = monat.split("-").map(Number);
  return m === 12 ? `${j + 1}-01-01` : `${j}-${String(m + 1).padStart(2, "0")}-01`;
};

// blaetter: aus fasseArbeitsblaetterZusammen, maler: Ergebnis von pruefeMalerliste
export function positionsAbgleich(blaetter, maler, monat) {
  const satzImMonat = new Map(); // Text|Einheit -> Satz (für gestrichene Positionen)
  for (const auf of maler.auftraege)
    for (const a of auf.abrechnungen)
      for (const p of a.positionen) if (p.satz && !p.anteilAus) satzImMonat.set(`${norm(p.name)}|${p.einheit}`, p.satz);

  const ergebnis = [];
  const nachAuftrag = new Map();
  for (const b of blaetter) {
    if (!nachAuftrag.has(b.auftrag)) nachAuftrag.set(b.auftrag, []);
    nachAuftrag.get(b.auftrag).push(b);
  }

  for (const [auftrag, liste] of nachAuftrag) {
    const auf = maler.auftraege.find((a) => a.auftrag === auftrag);
    const daten = liste.flatMap((b) => b.daten).sort();
    const vormonat = monat && daten.length && daten.at(-1) < monatsAnfang(monat);
    const laeuftWeiter = monat && daten.length && daten.at(-1) >= naechsterMonat(monat);
    const arbeiterBlatt = Math.max(...liste.map((b) => 1 + b.zusaetzlich.length));
    const team = auf?.teams[0] ?? null;
    const zeitraum = daten.length ? (daten[0] === daten.at(-1) ? datumKurz(daten[0]) : `${datumKurz(daten[0])} – ${datumKurz(daten.at(-1))}`) : "";

    const ort = liste.find((b) => b.ort)?.ort ?? ""; // nur Anzeige, nicht im Protokoll
    const eintrag = { auftrag, ort, zeitraum, vormonat, laeuftWeiter, teamArbeiter: team?.anzahlArbeiter ?? null, arbeiterBlatt, zeilen: [], hinweise: [] };
    ergebnis.push(eintrag);
    if (!auf) {
      eintrag.hinweise.push({ status: vormonat ? "info" : "hinweis", text: vormonat
        ? `Arbeitsblatt aus dem Vormonat (${zeitraum}), keine Akkordabrechnung in diesem Monat. Vermutlich schon früher abgerechnet.`
        : `Für dieses Arbeitsblatt (${zeitraum}) ist in der PDF keine Akkordabrechnung. Vielleicht kommt sie nächsten Monat.` });
      continue;
    }

    // Akkord-Positionen dieses Auftrags (alle Abrechnungen), Anteil je Arbeiter merken
    // "- Anteil Kollege 67 h" ist eine Aufteilung, keine Arbeit. Stehen dieselben Positionen auf der eigenen
    // UND der Team-Abrechnung (eigene Abrechnung enthält alles), zählen sie nur einmal.
    const proAbrechnung = auf.abrechnungen.map((a) => ({ a, pos: sammle(a.positionen
      .filter((p) => !p.anteilAus && p.menge != null && !OHNE_ABGLEICH.test(p.name) && !/\bAnteil\b/i.test(p.name))
      .map((p) => ({ name: p.name, einheit: p.einheit, menge: p.menge, betrag: p.gesamt ?? 0, satz: p.satz, anteil: a.team ? 1 / a.anzahlArbeiter : 1, team: a.team }))) }));
    const schluessel = (p) => `${norm(p.name)}|${p.einheit}|${p.menge}`;
    const eigenSchon = new Set(proAbrechnung.filter((x) => !x.a.team).flatMap((x) => x.pos.map(schluessel)));
    const akkord = sammle(proAbrechnung.flatMap((x) => (x.a.team ? x.pos.filter((p) => !eigenSchon.has(schluessel(p))) : x.pos)));
    let blatt = sammle(liste.flatMap((b) => b.positionen).filter((p) => p.menge > 0));

    // Nikotinfarbe: nur vergleichen, wenn sie in der Abrechnung als eigene Zeile steht. Sonst nur Info.
    const nikotinAkkord = akkord.filter((p) => NIKOTIN.test(p.name));
    for (const n of blatt.filter((p) => NIKOTIN.test(p.name))) {
      if (nikotinAkkord.length) { n.einheit = nikotinAkkord[0].einheit; continue; }
      blatt = blatt.filter((p) => p !== n);
      const weiss = blatt.find((p) => ZWEIMAL_WEISS.test(p.name));
      eintrag.hinweise.push({ status: "info", text: `„${n.name.replace(/[\s!.]+$/, "")}“ (${menge(n.menge)} m²) ist nur ein Hinweis, welche Farbe genommen wird. Abgerechnet wird es als Streichen - 2x weiß${weiss ? ` (${menge(weiss.menge)} ${weiss.einheit} im Blatt)` : ""}, darum nicht als eigene Position verglichen.` });
    }
    // Steht sie doch eigens in der Abrechnung, muss der Preis wie bei 2x weiß sein
    const weissSatz = akkord.find((p) => ZWEIMAL_WEISS.test(p.name))?.satz;
    for (const n of nikotinAkkord)
      if (weissSatz && n.satz && Math.abs(n.satz - weissSatz) > 0.005)
        eintrag.hinweise.push({ status: n.satz < weissSatz ? "fehler" : "plus", text: `„${n.name}“ ist mit ${euro(n.satz)} abgerechnet, Streichen - 2x weiß mit ${euro(weissSatz)}. Nikotinfarbe hat den gleichen Preis wie 2x weiß.` });

    // Zuordnen, Schritt für Schritt lockerer (ab Schritt 2 nur eindeutige Treffer):
    // 1) gleicher Text + Einheit, 2) ähnlicher Text + Einheit, 3) ähnlicher Text, andere Einheit (umgerechnet, z. B. m² -> Std),
    // 4) bleibt je Seite genau eine Position übrig: umbenannt (gleiche Einheit oder gemeinsames Stichwort)
    const paare = [], offenA = new Set(akkord), offenB = new Set(blatt);
    const paar = (b, a) => { paare.push([b, a]); offenA.delete(a); offenB.delete(b); };
    for (const b of blatt) {
      const a = akkord.find((x) => offenA.has(x) && norm(x.name) === norm(b.name) && gleicheEinheit(x, b));
      if (a) paar(b, a);
    }
    for (const passt of [(x, b) => gleicheEinheit(x, b) && aehnlich(x.name, b.name), (x, b) => aehnlich(x.name, b.name)])
      for (const b of [...offenB]) {
        const kand = [...offenA].filter((x) => passt(x, b));
        if (kand.length === 1) paar(b, kand[0]);
      }
    if (offenA.size === 1 && offenB.size === 1) {
      const [a] = offenA, [b] = offenB;
      if (gleicheEinheit(a, b) || gemeinsamesWort(a.name, b.name)) paar(b, a);
    }
    for (const b of offenB) paare.push([b, null]);
    for (const a of offenA) paare.push([null, a]);
    const tage = liste.reduce((s, b) => s + (b.tage ?? 0), 0) || null;

    // Blatt aus dem Vormonat, von dem hier gar nichts abgerechnet ist: nur eine Info statt jeder Zeile
    if (vormonat && paare.every(([b, a]) => !b || !a)) {
      eintrag.hinweise.push({ status: "info", text: `Arbeitsblatt aus dem Vormonat (${zeitraum}): Keine der ${blatt.length} Positionen ist in diesem Monat abgerechnet, vermutlich schon im Vormonat.` });
      continue;
    }

    const teamAnteil = auf.eigene.length ? 1 : (team ? 1 / team.anzahlArbeiter : 1);
    const satzFuer = (p) => satzImMonat.get(`${norm(p.name)}|${p.einheit}`) ?? (p.einheit === "Std" ? maler.regiesatz : null);
    for (const [b, a] of paare) {
      const eingereicht = b?.menge ?? 0, abgerechnet = a?.menge ?? 0;
      const umgerechnet = !!(a && b && a.einheit && b.einheit && einheitNorm(a.einheit) !== einheitNorm(b.einheit));
      const diff = umgerechnet ? null : r2(abgerechnet - eingereicht);
      const satz = a ? (a.menge ? a.betrag / a.menge : a.satz) : satzFuer(b);
      const anteil = a?.anteil ?? teamAnteil;
      let euroGesamt;
      let satzBlatt = null;
      if (umgerechnet) { satzBlatt = satzFuer(b); euroGesamt = satzBlatt != null ? r2(a.betrag - eingereicht * satzBlatt) : null; }
      else euroGesamt = satz != null ? r2(diff * satz) : null;
      const euroDein = euroGesamt != null ? r2(euroGesamt * anteil) : null;
      const richtung = umgerechnet ? (euroGesamt ?? 0) : diff;
      const art = umgerechnet ? "umgerechnet" : Math.abs(diff) < 0.005 ? "ok" : !a ? "gestrichen" : !b ? "neu" : diff < 0 ? "gekürzt" : "erhöht";
      // Mehr als 12 Std je Arbeiter und Tag eingereicht: vermutlich Tippfehler/falsche Einheit im Arbeitsblatt
      const unplausibel = !!(b && b.einheit === "Std" && tage && b.menge > 12 * tage * arbeiterBlatt);
      // Vormonat / läuft weiter: Abweichung nur als Info, nicht als Fehler
      const nurInfo = art !== "ok" && (vormonat || (laeuftWeiter && richtung < 0));
      // m² (Stk ...) eingereicht, als Regiestunden bezahlt, Satz pro m² unbekannt: Regie bringt mehr als pro m² = zu deinen Gunsten (Tom, 09.10.2026)
      const alsRegie = umgerechnet && euroGesamt == null && a.einheit === "Std" && b.einheit !== "Std";
      const status = art === "ok" ? "ok" : nurInfo ? "info" : alsRegie ? "plus" : unplausibel || (umgerechnet && euroGesamt == null) ? "hinweis" : richtung < 0 ? "fehler" : "plus";
      const zeile = {
        auftrag, name: (b ?? a).name.replace(/[\s,;:.]+$/, ""), einheit: (b ?? a).einheit, einheitAbger: a?.einheit ?? null,
        eingereicht, abgerechnet, diff, satz, euroGesamt, euroDein, art, status, unplausibel,
        plus: !!b?.plus, team: !!a?.team || (!a && !auf.eigene.length && !!team), anteil,
        nameAbger: a && b && norm(a.name) !== norm(b.name) ? a.name : null, satzBlatt,
      };
      zeile.erklaerung = erklaere(zeile, { vormonat, laeuftWeiter, zeitraum, teamArbeiter: team?.anzahlArbeiter });
      eintrag.zeilen.push(zeile);
    }
    gegenrechnen(eintrag.zeilen, { vormonat, laeuftWeiter, zeitraum });

    // Aufteilung nachrechnen
    if (team) {
      const tp = r2(team.positionen.filter((x) => x.tagespauschale).reduce((s, x) => s + x.gesamt, 0));
      const soll = r2((team.summe - tp) / team.anzahlArbeiter + tp);
      const ok = team.anteil != null && Math.abs(soll - team.anteil) <= RUNDUNG;
      eintrag.aufteilung = { summe: team.summe, anzahl: team.anzahlArbeiter, tp, soll, anteil: team.anteil, ok };
      if (arbeiterBlatt !== team.anzahlArbeiter && !auf.eigene.length)
        eintrag.hinweise.push({ status: "hinweis", text: `Laut Arbeitsblatt ${arbeiterBlatt} Arbeiter, abgerechnet wurde auf ${team.anzahlArbeiter} Arbeiter aufgeteilt.` });
    }
  }
  ergebnis.sort((a, b) => a.auftrag.localeCompare(b.auftrag));
  return ergebnis;
}

const datumKurz = (iso) => iso.split("-").reverse().join(".");

// ---------- 3. Umbuchung im selben Auftrag ----------
// Oft streicht das Lohnbüro nichts, sondern bucht die Menge auf eine andere Position desselben Auftrags um
// (z. B. 100 m² „Leimfarbe abscheren“ → „Raufaserfarbe abscheren“). Gekürzte/gestrichene (Minus) und erhöhte/neue
// Positionen (Plus) mit gleicher Einheit werden gegengerechnet, zuerst mit gemeinsamem Stichwort („abscheren“).
// Ohne Stichwort nur, wenn es in der Einheit genau ein Minus und ein Plus gibt (dann immer orange).
// NIE zwischen verschiedenen Aufträgen. Was nicht ausgeglichen wird, bleibt als Rest rot.
function stichwort(a, b) {
  const wb = [...woerter(b)];
  for (const w of woerter(a)) {
    if (w.length >= 5 && wb.includes(w)) return w;
    const x = wb.find((x) => Math.min(x.length, w.length) >= 6 && (x.startsWith(w) || w.startsWith(x)));
    if (x) return x.length < w.length ? x : w; // Malereiausbesserung(en)
  }
  return null;
}

// Gleiche Fläche nur einmal: Bei Entfernungsarbeiten (abscheren, entfernen, ...) zahlt das Lohnbüro dieselbe Fläche nur
// einmal. Beispiel: 169,57 m² Leimfarbe abscheren + 60,47 m² Rauhfaseranstrich entfernen eingereicht, abgerechnet
// 109,10 m² Leimfarbe + 60,47 m² Raufaser -> die Kürzung ist genau die Raufaser-Fläche = kein Fehler (Tom, 09.10.2026).
const ENTFERNEN = /abscher|entfern|abwasch|abbeiz|abkratz|abl[öo]s|abschleif/i;

function gegenrechnen(zeilen, k) {
  // Nur echte Abweichungen: keine Infos (Vormonat, läuft weiter), Tippfehler, anderen Einheiten oder Abzugszeilen (Menge < 0)
  const offen = (z) => z.diff != null && !z.unplausibel && (z.status === "fehler" || z.status === "plus") && z.abgerechnet >= 0;
  const minus = zeilen.filter((z) => offen(z) && z.diff < 0), plus = zeilen.filter((z) => offen(z) && z.diff > 0);
  if (!minus.length) return;
  const rest = new Map([...minus, ...plus].map((z) => [z, Math.abs(z.diff)]));
  const umbuchungen = [];
  const buche = (m, p, wort) => {
    const mg = r2(Math.min(rest.get(m), rest.get(p)));
    if (mg < 0.005) return;
    rest.set(m, r2(rest.get(m) - mg));
    rest.set(p, r2(rest.get(p) - mg));
    umbuchungen.push({ m, p, menge: mg, wort });
  };
  const gleich = (m, p) => einheitNorm(m.einheit) === einheitNorm(p.einheit);
  // 1) gemeinsames Stichwort, ähnlichste Mengen zuerst
  const paare = minus.flatMap((m) => plus.filter((p) => gleich(m, p)).map((p) => ({ m, p, wort: stichwort(m.name, p.name) })))
    .filter((x) => x.wort).sort((a, b) => Math.abs(a.m.diff + a.p.diff) - Math.abs(b.m.diff + b.p.diff));
  for (const x of paare) buche(x.m, x.p, x.wort);
  // 2) ohne Stichwort: je Einheit genau ein offenes Minus und ein offenes Plus
  for (const m of minus) {
    const mo = minus.filter((x) => gleich(x, m) && rest.get(x) > 0.005), po = plus.filter((x) => gleich(x, m) && rest.get(x) > 0.005);
    if (mo.length === 1 && po.length === 1 && mo[0] === m) buche(m, po[0], null);
  }
  // 3) gleiche Fläche: offene Kürzung einer Entfernungsarbeit GENAU so groß (±1 Cent-Stelle) wie eine andere eingereichte
  //    Entfernungsarbeit mit gleicher Einheit (jede nur einmal). Andere Größe = Zufall, bleibt rot.
  const benutzt = new Set();
  for (const m of minus.filter((x) => ENTFERNEN.test(x.name))) {
    const r = rest.get(m);
    const andere = zeilen.find((x) => x !== m && !benutzt.has(x) && x.eingereicht > 0 && Math.abs(x.eingereicht - r) <= 0.011 && ENTFERNEN.test(x.name) && gleich(x, m));
    if (!andere) continue;
    benutzt.add(andere);
    rest.set(m, 0);
    (m.flaeche ??= []).push({ menge: r, mit: andere.name });
  }
  // 4) Überscheren: Wo abgeschert wird, zahlt das Lohnbüro Überscheren nicht extra (Tom, 09.10.2026; an allen Zetteln
  //    2024–2026 bestätigt). Kürzung GENAU so groß wie eine Abscher-Position oder alle zusammen (abgerechnete Menge) = grün.
  for (const m of minus.filter((x) => /Überscher/i.test(x.name) && rest.get(x) > 0.005)) {
    const r = rest.get(m);
    const abscher = zeilen.filter((x) => x !== m && /abscher/i.test(x.name) && x.abgerechnet > 0 && gleich(x, m));
    const summe = r2(abscher.reduce((s, x) => s + x.abgerechnet, 0));
    const eine = abscher.find((x) => Math.abs(x.abgerechnet - r) <= 0.011);
    const liste = eine ? [eine] : abscher.length > 1 && Math.abs(summe - r) <= 0.011 ? abscher : null;
    if (!liste) continue;
    rest.set(m, 0);
    (m.flaeche ??= []).push({ menge: r, mit: liste.map((x) => x.name).join("“ + „"), ueberscheren: true });
  }

  const satzCent = (z) => (z.satz != null ? r2(z.satz) : null); // gedruckter Satz, ohne Rundungsreste aus Betrag ÷ Menge
  const neueZeilen = [];
  for (const u of umbuchungen) {
    const { m, p } = u, sv = satzCent(m), sn = satzCent(p);
    const euroVon = sv != null ? r2(u.menge * sv * m.anteil) : null; // so viel fällt bei der gekürzten Position weg (dein Anteil)
    const euroNach = sn != null ? r2(u.menge * sn * p.anteil) : null; // so viel kommt bei der anderen dazu
    const euroDein = euroVon != null && euroNach != null ? r2(euroNach - euroVon) : null;
    const euroGesamt = sv != null && sn != null ? r2(u.menge * (sn - sv)) : null;
    const status = euroDein != null && u.wort && Math.abs(euroDein) <= RUNDUNG ? "ok" : "hinweis";
    const z = {
      auftrag: m.auftrag, name: `${m.name} → ${p.name}`, einheit: p.einheit, einheitAbger: p.einheit,
      eingereicht: u.menge, abgerechnet: u.menge, diff: 0, satz: sn, euroGesamt, euroDein, art: "umgebucht", status,
      unplausibel: false, plus: false, team: m.team || p.team, anteil: p.anteil, nameAbger: null,
      umbuchung: { von: m.name, nach: p.name, menge: u.menge, einheit: p.einheit, satzVon: sv, satzNach: sn, euroVon, euroNach, stichwort: u.wort, anteilVon: m.anteil, anteilNach: p.anteil },
    };
    z.erklaerung = erklaereUmbuchung(z);
    neueZeilen.push([m, z]);
    (m.umgebucht ??= []).push({ menge: u.menge, richtung: "auf", mit: p.name, status });
    (p.umgebucht ??= []).push({ menge: u.menge, richtung: "von", mit: m.name, status });
  }
  // Gekürzte/erhöhte Zeilen behalten nur den Rest ohne Ausgleich
  for (const z of rest.keys()) {
    if (!z.umgebucht && !z.flaeche) continue;
    z.diff = r2(Math.sign(z.diff) * rest.get(z));
    z.euroGesamt = z.satz != null ? r2(z.diff * z.satz) : null;
    z.euroDein = z.euroGesamt != null ? r2(z.euroGesamt * z.anteil) : null;
    if (Math.abs(z.diff) < 0.005) {
      // ganz ausgeglichen: Farbe der Umbuchung (gleiche Fläche = grün), zählt nicht extra
      z.ausgeglichen = true;
      z.art = z.umgebucht ? "umgebucht" : "flaeche";
      z.status = z.umgebucht?.some((x) => x.status === "hinweis") ? "hinweis" : "ok";
      z.euroGesamt = z.euroDein = 0;
    }
    z.erklaerung = erklaere(z, k);
  }
  // Umbuchungszeile direkt unter die gekürzte Position
  const neu = zeilen.flatMap((x) => [x, ...neueZeilen.filter(([m]) => m === x).map(([, z]) => z)]);
  zeilen.splice(0, zeilen.length, ...neu);
}

// „Andere Einheit“ ohne Satz im eigenen Monat (z. B. Schimmelbehandlung 5 m² eingereicht, 0,50 Std abgerechnet):
// Satz nachträglich aus dem Preisverlauf anderer Monate setzen (Aufruf aus pruefePreisverlauf). eintrag = Auftrag im Abgleich.
export function umrechnenMitSatz(z, satz, anzahl, eintrag) {
  z.satzBlatt = satz;
  z.satzQuelle = `üblicher Satz aus anderen Monaten, ${anzahl}×`;
  z.euroGesamt = r2(z.abgerechnet * z.satz - z.eingereicht * satz);
  z.euroDein = r2(z.euroGesamt * z.anteil);
  z.status = Math.abs(z.euroGesamt) <= RUNDUNG ? "ok" : z.euroGesamt < 0 ? "fehler" : "plus";
  z.erklaerung = erklaere(z, eintrag);
}

function erklaereUmbuchung(z) {
  const u = z.umbuchung, e = (x) => `${menge(x)} ${u.einheit}`.trim();
  let t = `${e(u.menge)} „${u.von}“ → „${u.nach}“: im selben Auftrag umgebucht, nicht gestrichen.`;
  if (!u.stichwort) t += " Die beiden Positionen haben kein gemeinsames Stichwort, es ist aber die einzige passende Kürzung und Erhöhung mit dieser Einheit. Bitte selbst ansehen.";
  if (z.euroDein == null) return t + " Ein Satz ist unbekannt, die €-Wirkung ist nicht berechenbar.";
  const teil = (mg, satz, anteil) => `${e(mg)} × ${euro(satz)}${anteil < 1 ? ` ÷ ${Math.round(1 / anteil)}` : ""}`;
  t += ` Weg: ${teil(u.menge, u.satzVon, u.anteilVon)} = ${euro(u.euroVon)}, dazu: ${teil(u.menge, u.satzNach, u.anteilNach)} = ${euro(u.euroNach)}.`;
  if (Math.abs(z.euroDein) <= RUNDUNG) return t + " Menge und Betrag gleichen sich aus.";
  const grund = Math.abs(u.satzVon - u.satzNach) > 0.005 ? `durch anderen ${u.einheit}-Preis (${euro(u.satzVon)} → ${euro(u.satzNach)})` : "durch anderen Team-Anteil";
  return t + ` Die Menge gleicht sich aus, aber ${vorzeichenEuro(z.euroDein)} ${grund}${z.euroDein < 0 ? ": zu wenig bezahlt." : " zu deinen Gunsten."}`;
}

function erklaere(z, k) {
  const e = (x, einheit = z.einheit) => `${menge(x)} ${einheit}`.trim();
  const titel = z.nameAbger ? `${z.name} (abgerechnet als „${z.nameAbger}“)` : z.name;
  let t;
  if (z.umgebucht || z.flaeche) {
    // Teil oder alles ist im selben Auftrag auf/von einer anderen Position umgebucht oder dieselbe Fläche
    t = `${titel}: ${z.eingereicht ? `${e(z.eingereicht)} eingereicht` : "nicht im Arbeitsblatt"}, ${z.abgerechnet ? `${e(z.abgerechnet, z.einheitAbger ?? z.einheit)} abgerechnet` : "nicht abgerechnet"}.`;
    if (z.umgebucht) t += ` Davon ${z.umgebucht.map((x) => `${e(x.menge)} ${x.richtung} „${x.mit}“`).join(", ")} umgebucht (siehe Umbuchung).`;
    for (const f of z.flaeche ?? [])
      t += f.ueberscheren
        ? ` ${z.umgebucht ? "Weitere" : "Die fehlenden"} ${e(f.menge)} sind genau die abgescherte Fläche („${f.mit}“). Wo abgeschert wird, wird Überscheren nicht extra bezahlt, darum kein Fehler.`
        : ` ${z.umgebucht ? "Weitere" : "Die fehlenden"} ${e(f.menge)} sind genau die Fläche von „${f.mit}“, die du im selben Auftrag eigens eingereicht hast. Dieselbe Fläche wird nur einmal abgerechnet, darum kein Fehler.`;
    if (z.ausgeglichen) return z.umgebucht ? t + " Damit ist die Menge ausgeglichen." : t;
    t += ` Es bleiben ${vzMenge(z.diff)} ${z.einheit} ohne Ausgleich`;
    t += z.euroGesamt == null ? ", Satz unbekannt, € nicht berechenbar." : z.anteil < 1 ? `: ${vorzeichenEuro(z.euroGesamt)} für das Team, dein Anteil (÷ ${Math.round(1 / z.anteil)}) ${vorzeichenEuro(z.euroDein)}.` : `: ${vorzeichenEuro(z.euroDein)} (${vzMenge(z.diff)} ${z.einheit} × ${euro(z.satz)}).`;
    if (z.plus) t += " Die Position war nachgetragen (+).";
    if (/Überscher/i.test(z.name) && z.diff < 0) t += " Überscheren und abkehren gehört fix zur Arbeit und steht dir zu.";
    return t;
  }
  if (z.art === "ok") t = `${titel}: ${e(z.eingereicht)} eingereicht und abgerechnet.`;
  else if (z.art === "gestrichen") t = `${titel}: ${e(z.eingereicht)} eingereicht, nicht abgerechnet`;
  else if (z.art === "neu") t = `${titel}: nicht im Arbeitsblatt, ${e(z.abgerechnet)} abgerechnet`;
  else t = `${titel}: ${e(z.eingereicht)} eingereicht, ${e(z.abgerechnet, z.einheitAbger ?? z.einheit)} abgerechnet`;
  if (z.art !== "ok") {
    if (z.art === "umgerechnet" && z.euroGesamt == null)
      t += z.status === "plus" && z.einheitAbger === "Std"
        ? `. Als Regiestunden bezahlt statt pro ${z.einheit}: ${euro(r2(z.abgerechnet * z.satz))}. Den Satz pro ${z.einheit} kennt die App nicht (in den geladenen Monaten nicht pro ${z.einheit} abgerechnet), Regiestunden bringen aber mehr als pro ${z.einheit}, darum zu deinen Gunsten.`
        : ` (andere Einheit, der eingereichte Wert ist nicht in € umrechenbar). Bitte selbst ansehen.`;
    else if (z.art === "umgerechnet") {
      const bezahlt = r2(z.abgerechnet * z.satz), waere = r2(z.eingereicht * z.satzBlatt);
      t += `. Eingereicht wären das ${e(z.eingereicht)} × ${euro(z.satzBlatt)} = ${euro(waere)}${z.satzQuelle ? ` (${z.satzQuelle})` : ""}, bezahlt sind ${euro(bezahlt)}`;
      t += Math.abs(z.euroGesamt) <= RUNDUNG ? ", passt." : `: ${z.anteil < 1 ? `${vorzeichenEuro(z.euroGesamt)} für das Team, dein Anteil (÷ ${Math.round(1 / z.anteil)}) ` : ""}${vorzeichenEuro(z.euroDein)}${z.euroGesamt > 0 ? " zu deinen Gunsten." : ", zu wenig bezahlt."}`;
    }
    else if (z.euroGesamt == null) t += ` (${vzMenge(z.diff)} ${z.einheit}, Satz unbekannt, € nicht berechenbar).`;
    else if (z.anteil < 1) t += `, ${vorzeichenEuro(z.euroGesamt)} für das Team, dein Anteil (÷ ${Math.round(1 / z.anteil)}) ${vorzeichenEuro(z.euroDein)}.`;
    else t += `, ${vorzeichenEuro(z.euroDein)}${z.satz ? ` (${vzMenge(z.diff)} ${z.einheit} × ${euro(z.satz)})` : ""}.`;
    if (z.unplausibel) t += ` Mehr als 12 Std je Arbeiter und Tag eingereicht: vermutlich ein Tippfehler oder falsche Einheit im Arbeitsblatt. Zählt nicht zur Netto-Wirkung.`;
    if (z.plus) t += " Die Position war nachgetragen (+).";
    // Überscheren wird oft gekürzt, gehört aber fix zur Arbeit (Tom, 10/2026)
    if (/Überscher/i.test(z.name) && z.diff != null && z.diff < 0)
      t += " Überscheren und abkehren gehört fix zur Arbeit und steht dir zu.";
    if (k.vormonat) t += ` Das Arbeitsblatt ist aus dem Vormonat (${k.zeitraum}) und wurde vielleicht schon teilweise abgerechnet, daher nur zur Info.`;
    else if (k.laeuftWeiter && z.status === "info") t += ` Der Auftrag läuft noch bis ${k.zeitraum.split(" – ").at(-1)}, der Rest kommt vielleicht nächsten Monat.`;
  }
  return t;
}

// ---------- 4. Netto-Wirkung ----------
// Abweichungen zwischen verschiedenen Aufträgen werden bewusst NICHT gegengerechnet (Tom, 10/2026), nur im selben Auftrag (siehe 3.).
// Ganz ausgeglichene Positionen zählen nicht extra, ihre Wirkung steckt in der Umbuchungszeile.
const zaehlt = (z) => ["fehler", "hinweis", "plus"].includes(z.status) && !z.unplausibel && !z.ausgeglichen;

// Netto-Wirkung = Summe aller gezählten Abweichungen (dein Anteil). Infos (Vormonat, läuft weiter) und Tippfehler zählen nicht.
export const nettoWirkung = (abgleich) =>
  r2(abgleich.flatMap((a) => a.zeilen).filter(zaehlt).reduce((s, z) => s + (z.euroDein ?? 0), 0));
