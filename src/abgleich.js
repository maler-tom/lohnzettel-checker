// Brutto-Check (Akkord, Urlaub, Auslösen) und Positionsabgleich Arbeitsblatt ↔ Akkordabrechnung.
import { euro } from "./pruefungen.js?v=0.14";

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
      if (umgerechnet) { const sb = satzFuer(b); euroGesamt = sb != null ? r2(a.betrag - eingereicht * sb) : null; }
      else euroGesamt = satz != null ? r2(diff * satz) : null;
      const euroDein = euroGesamt != null ? r2(euroGesamt * anteil) : null;
      const richtung = umgerechnet ? (euroGesamt ?? 0) : diff;
      const art = umgerechnet ? "umgerechnet" : Math.abs(diff) < 0.005 ? "ok" : !a ? "gestrichen" : !b ? "neu" : diff < 0 ? "gekürzt" : "erhöht";
      // Mehr als 12 Std je Arbeiter und Tag eingereicht: vermutlich Tippfehler/falsche Einheit im Arbeitsblatt
      const unplausibel = !!(b && b.einheit === "Std" && tage && b.menge > 12 * tage * arbeiterBlatt);
      // Vormonat / läuft weiter: Abweichung nur als Info, nicht als Fehler
      const nurInfo = art !== "ok" && (vormonat || (laeuftWeiter && richtung < 0));
      const status = art === "ok" ? "ok" : nurInfo ? "info" : unplausibel || (umgerechnet && euroGesamt == null) ? "hinweis" : richtung < 0 ? "fehler" : "plus";
      const zeile = {
        auftrag, name: (b ?? a).name.replace(/[\s,;:.]+$/, ""), einheit: (b ?? a).einheit, einheitAbger: a?.einheit ?? null,
        eingereicht, abgerechnet, diff, satz, euroGesamt, euroDein, art, status, unplausibel,
        plus: !!b?.plus, team: !!a?.team || (!a && !auf.eigene.length && !!team), anteil,
        nameAbger: a && b && norm(a.name) !== norm(b.name) ? a.name : null,
      };
      zeile.erklaerung = erklaere(zeile, { vormonat, laeuftWeiter, zeitraum, teamArbeiter: team?.anzahlArbeiter });
      eintrag.zeilen.push(zeile);
    }

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

function erklaere(z, k) {
  const e = (x, einheit = z.einheit) => `${menge(x)} ${einheit}`.trim();
  const titel = z.nameAbger ? `${z.name} (abgerechnet als „${z.nameAbger}“)` : z.name;
  let t;
  if (z.art === "ok") t = `${titel}: ${e(z.eingereicht)} eingereicht und abgerechnet.`;
  else if (z.art === "gestrichen") t = `${titel}: ${e(z.eingereicht)} eingereicht, nicht abgerechnet`;
  else if (z.art === "neu") t = `${titel}: nicht im Arbeitsblatt, ${e(z.abgerechnet)} abgerechnet`;
  else t = `${titel}: ${e(z.eingereicht)} eingereicht, ${e(z.abgerechnet, z.einheitAbger ?? z.einheit)} abgerechnet`;
  if (z.art !== "ok") {
    if (z.art === "umgerechnet")
      t += z.euroGesamt == null ? ` (andere Einheit, der eingereichte Wert ist nicht in € umrechenbar). Bitte selbst ansehen.` : `, Unterschied zum üblichen Satz ${vorzeichenEuro(z.euroDein)}.`;
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

// ---------- 4. Umbuchungen ----------
// Kürzung und Erhöhung mit gleicher Stundenzahl = mögliche Umbuchung (Stunden in einen anderen Auftrag/eine andere Position geschoben).
const zaehlt = (z) => ["fehler", "hinweis", "plus"].includes(z.status) && !z.unplausibel;
// Wirkung einer Umbuchung für dich: weniger = rot, mehr = blau, ±0 = nur Hinweis
export const umbuchungStatus = (g) => (g.netto < -0.005 ? "fehler" : g.netto > 0.005 ? "plus" : "hinweis");
export function umbuchungen(abgleich) {
  const zeilen = abgleich.flatMap((a) => a.zeilen).filter((z) => zaehlt(z) && z.diff != null && z.einheit === "Std");
  const minus = zeilen.filter((z) => z.diff < 0), plus = zeilen.filter((z) => z.diff > 0);
  const benutzt = new Set(), gruppen = [];
  for (const m of minus) {
    // lieber in einen anderen Auftrag, dann gleicher Satz
    const p = plus.filter((x) => !benutzt.has(x) && Math.abs(x.diff + m.diff) < 0.005)
      .sort((a, b) => (a.auftrag === m.auftrag) - (b.auftrag === m.auftrag) || Math.abs(a.satz - m.satz) - Math.abs(b.satz - m.satz))[0];
    if (!p) continue;
    benutzt.add(p);
    const netto = r2((m.euroDein ?? 0) + (p.euroDein ?? 0));
    const warnungen = [];
    if (p.team && !m.team) warnungen.push(`Die ${menge(p.diff)} ${p.einheit} wurden in einen Teamauftrag verschoben: Dort bekommst du nur ${Math.round(p.anteil * 100)} % davon.`);
    if (m.team && !p.team) warnungen.push(`Die ${menge(p.diff)} ${p.einheit} kommen aus einem Teamauftrag.`);
    if (m.satz != null && p.satz != null && Math.abs(m.satz - p.satz) > 0.005)
      warnungen.push(`Verschoben zu einem anderen Satz: ${euro(m.satz)} → ${euro(p.satz)} je ${p.einheit}.`);
    gruppen.push({ von: m, nach: p, menge: p.diff, einheit: p.einheit, netto, warnungen });
  }
  return gruppen;
}

// Netto-Wirkung = Summe aller gezählten Abweichungen (dein Anteil). Infos (Vormonat, läuft weiter) und Tippfehler zählen nicht.
export const nettoWirkung = (abgleich) =>
  r2(abgleich.flatMap((a) => a.zeilen).filter(zaehlt).reduce((s, z) => s + (z.euroDein ?? 0), 0));
