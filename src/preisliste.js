// Stufe 2: Vergleich mit der eigenen Lohnpreisliste (PDF "Lohnpreisliste SUB").
// Die Liste lädt jeder selbst hoch, sie bleibt nur im Browser. Hier im Code stehen
// KEINE Preise, nur welche Bezeichnung auf der Abrechnung zu welcher Artikelnummer gehört.
import { zahl, zeilenText } from "./parser.js?v=0.21";
import { euro } from "./pruefungen.js?v=0.21";

const ZAHL = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
const EINHEIT = /^(m²|m2|lfm|Stk|x|RI|Rl|Std|Raum|m)$/i;
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const menge = (x) => x.toLocaleString("de-DE", { maximumFractionDigits: 2 });
const einheit = (e) => (e ?? "").trim().replace(/^m2$/i, "m²").replace(/^Rl$/i, "RI");

export function istPreisliste(seitenZeilen) {
  return seitenZeilen.some((z) => z.slice(0, 6).some((l) => /Lohnpreisliste|Liste Löhne/i.test(zeilenText(l))));
}

// Liest alle Zeilen "ArtNr  Matchcode  Bezeichnung  Einheit  Preis €"
export function lesePreisliste(seitenZeilen) {
  const artikel = {};
  let stand = null, gruppe = null, letzte = null;
  for (const zeilen of seitenZeilen) {
    for (const l of zeilen) {
      const text = zeilenText(l);
      stand ??= (text.match(/vom:?\s*(\d\d\.\d\d\.\d{4})/) || [])[1] ?? null;
      gruppe ??= (text.match(/Artikelgruppe:\s*(.+)/) || [])[1]?.trim() ?? null;
      const zellen = l.zellen.map((z) => z.text.trim()).filter((t) => t && t !== "€");
      if (!/^\d{6}$/.test(zellen[0] ?? "")) {
        // Umbruch einer langen Bezeichnung
        if (letzte && zellen.length === 1 && l.zellen[0].x > 150 && !/Copyright|Ende/i.test(text)) letzte.name += " " + zellen[0];
        continue;
      }
      const iPreis = zellen.findLastIndex((t) => ZAHL.test(t.replace(/\s*€$/, "")));
      const iEinheit = zellen.findLastIndex((t, i) => i < iPreis && EINHEIT.test(t));
      if (iPreis < 0 || iEinheit < 0) continue;
      // Matchcode (nur Großbuchstaben) weglassen
      const name = zellen.slice(1, iEinheit).filter((t) => t !== t.toUpperCase() || !/[A-ZÄÖÜ]/.test(t)).join(" ");
      letzte = artikel[zellen[0]] = { name, einheit: einheit(zellen[iEinheit]), preis: zahl(zellen[iPreis].replace(/\s*€$/, "")) };
    }
  }
  return { stand, gruppe, artikel, anzahl: Object.keys(artikel).length };
}

// Bezeichnung auf der Abrechnung -> passende Artikelnummer(n). Reihenfolge zählt: die erste passende Regel gilt.
// Mehrere Nummern = Staffelpreise (z. B. Tapeten 1–5 / 6–24 / ab 25 Rollen), dann passt jeder davon.
const ZUORDNUNG = [
  [/nachverrechnung|neuverrech|rückverr|nachzahlung|von \d\s*x|3\s*x\s*getönt/, []], // Sonderfälle: nicht vergleichen
  [/fahrtpauschale.*zone:?\s*1\b/, ["100342"]],
  [/fahrtpauschale.*zone:?\s*2\b/, ["100346"]],
  [/fahrtpauschale.*zone:?\s*3\b/, ["100350"]],
  [/acryl/, ["100912"]],
  [/bandage/, ["100306"]],
  [/tapete\w* entfernen.*leimfarbe/, ["106550"]],
  [/tapete\w* entfernen/, ["100544"]],
  [/leimfarbe abscheren/, ["100406"]],
  [/reibeputz|spritzputz/, ["106587"]],
  [/überscheren und abkehren|überscheren u\.? ?abkehren/, ["100667"]],
  [/^rauhfaser(farbe)? überscheren/, ["100488"]],
  [/^überscheren/, ["100667", "100488"]],
  [/vorstreichen/, ["100663"]],
  [/wasserflecken|schimmel(?!farbe)/, ["100522"]],
  [/löcher/, ["100653"]],
  [/netzen und spachteln|gewebe|vlies/, ["100608"]],
  [/spachteltechnik/, ["106560"]],
  [/spachteln\s*-?\s*3\s*x/, ["107095"]],
  [/spachteln\s*-?\s*2\s*x/, ["100647"]],
  [/spachteln\s*-?\s*1\s*x|teilw\w*\.? spachteln/, ["100645"]],
  [/styropor/, ["100543"]],
  [/füllungstür.*zarge/, ["100357"]],
  [/füllungstür/, ["106764"]],
  [/zarge.*holz/, ["106745"]],
  [/zarge/, ["100625"]],
  [/türblatt/, ["100590"]],
  [/rippen/, ["100362"]],
  [/heizkörper.*flach/, ["101045"]],
  [/kantenschutz/, ["100394"]],
  [/wischtechnik.*mehrf/, ["100901"]],
  [/wischtechnik/, ["100900"]],
  [/rauhfasertapete/, ["100491", "100492"]],
  [/tapete\w* verlegen/, ["100546", "100548", "100547"]],
  [/makulier/, ["100632", "100633"]],
  [/^fenster/, ["100355", "100356"]],
  [/rauhputz/, ["100493"]],
  [/dämmkeil/, ["106713"]],
  [/brandschutz/, ["101058"]],
  [/rauhfaserfarbe/, ["100489", "100490"]],
  [/(rauhfaser|alt)anstrich entfernen/, []], // Maler: Entfernen ohne eigene Listenposition, nicht vergleichen
  // Streichen allgemein: 1x/2x und weiß/getönt aus dem Text
  [/streichen|anstrich|latex|nikotinfarbe/, (n) => (/getönt|tönung/.test(n) ? (/1\s*x/.test(n) ? ["100321"] : ["100323"]) : /1\s*x/.test(n) ? ["100322"] : ["100324"])],
];

// Für den Namensvergleich: "Spachteln - 1 x" = "spachteln 1x", "-----> ab 100 m²" usw.
const vergleichsName = (t) => t.toLowerCase()
  .replace(/[–—]/g, "-").replace(/-+>|>/g, " ").replace(/(\d)\s*[x×](?![a-zäöüß])/g, "$1x")
  .replace(/[()\-/.,:;+"„“]/g, " ").replace(/\s+/g, " ").trim();
// Staffel-Zusatz am Ende ("ab 100 m²", "bis 9,99 m²", "ab 50 Stk.")
const ohneStaffel = (t) => t.replace(/\s*-*\s*>*\s*(ab|bis)\s+[\d.,]+\s*(m²|m2|lfm|stk\.?|rollen)?\.?\s*$/i, "");

// Rückfall, wenn keine Regel passt: Bezeichnung = Artikelname in der Liste (samt seinen Staffeln).
// Zusätze in Klammern auf der Abrechnung ("(Bad)", "(D+W)") werden dafür weggelassen.
export function artikelPerName(pos, liste, ohneKlammer = true) {
  const n = vergleichsName(ohneKlammer ? pos.name.replace(/\s*\([^)]*\)\s*$/, "") : pos.name);
  if (!n) return [];
  const genau = Object.entries(liste.artikel).filter(([, a]) => vergleichsName(a.name) === n);
  if (!genau.length) return [];
  // Ist die Position selbst eine Staffel ("... ab 100 m²"), gilt nur diese. Sonst Grundpreis + alle Staffeln.
  if (vergleichsName(ohneStaffel(pos.name)) !== n) return genau.map(([nr]) => nr);
  const basis = vergleichsName(ohneStaffel(genau[0][1].name));
  return Object.entries(liste.artikel).filter(([, a]) => vergleichsName(ohneStaffel(a.name)) === basis).map(([nr]) => nr);
}

// Welche Staffel gilt für diese Menge? "ab 100" ab 100, "bis 9,99" bis 9,99, sonst der Grundpreis.
function staffelPreis(kandidaten, menge) {
  const grenze = (a) => {
    const m = a.name.match(/\b(ab|bis)\s+([\d.]*\d(?:,\d+)?)/i);
    return m ? { art: m[1].toLowerCase(), wert: zahlWert(m[2]) } : null;
  };
  const staffeln = kandidaten.map((a) => ({ a, g: grenze(a) }));
  const treffer = staffeln.filter(({ g }) => g && (g.art === "ab" ? menge >= g.wert : menge <= g.wert));
  if (treffer.length) return treffer[0].a.preis;
  return staffeln.find(({ g }) => !g)?.a.preis ?? null;
}
const zahlWert = (t) => Number(t.replace(/\./g, "").replace(",", "."));

export function artikelFuer(pos) {
  const n = pos.name.toLowerCase();
  // "Spachteln" pro Raum ist immer die Löcher-Pauschale
  if (pos.einheit === "Raum" && /spachtel/.test(n)) return ["100653"];
  for (const [re, nr] of ZUORDNUNG) if (re.test(n)) return typeof nr === "function" ? nr(n) : nr;
  return null; // keine Regel: dann darf der Namensvergleich ran
}

// Hängt die Preislisten-Prüfungen an die Aufträge. Gibt eine kurze Zusammenfassung zurück.
export function pruefeGegenPreisliste(m, liste) {
  let verglichen = 0, ohne = 0;
  for (const auf of m.maler.auftraege) {
    const gemeldet = new Set();
    for (const a of auf.abrechnungen) {
      for (const pos of a.positionen) {
        if (pos.anteilAus || !pos.einheit || pos.einheit === "Std" || !(pos.satz > 0) || pos.menge == null) continue;
        const passend = (nrs) => nrs.map((nr) => liste.artikel[nr]).filter((x) => x && x.einheit === einheit(pos.einheit));
        // Eine Regel, die bewusst nichts liefert (Sonderfall), wird respektiert. Der Namensvergleich
        // springt nur ein, wenn keine Regel passt oder ihre Artikel nicht in dieser Liste stehen.
        // 1. Name steht genau so in der Liste  2. Regel  3. Name ohne Klammerzusatz
        let kandidaten = passend(artikelPerName(pos, liste, false));
        const ausRegel = kandidaten.length ? [] : artikelFuer(pos);
        if (!kandidaten.length) kandidaten = passend(ausRegel ?? []);
        if (!kandidaten.length && (ausRegel === null || ausRegel.length)) kandidaten = passend(artikelPerName(pos, liste));
        if (!kandidaten.length) { ohne++; continue; }
        verglichen++;
        const preise = [...new Set(kandidaten.map((x) => x.preis))].sort((x, y) => x - y);
        if (preise.some((p) => Math.abs(p - pos.satz) < 0.005)) continue;
        const k = `${pos.name}|${pos.satz}`;
        if (gemeldet.has(k)) continue;
        gemeldet.add(k);
        const lp = preise.length === 1 ? preise[0] : staffelPreis(kandidaten, pos.menge) ?? preise.find((p) => p > pos.satz) ?? preise.at(-1);
        const listenText = preise.length === 1 ? `„${kandidaten[0].name}“ ${euro(lp)}/${pos.einheit}` : `„${kandidaten[0].name}“ ${preise.map((p) => euro(p)).join(" / ")} je ${pos.einheit} (Staffel, bei ${menge(pos.menge)} ${pos.einheit} gilt ${euro(lp)})`;
        const diff = r2(Math.abs(lp - pos.satz) * pos.menge);
        if (pos.satz < preise[0])
          auf.pruefungen.push({ status: "fehler", titel: `${pos.name}: unter Listenpreis`, text: `Abgerechnet ${menge(pos.menge)} ${pos.einheit} × ${euro(pos.satz)}, laut Preisliste ${listenText}. Das sind ${euro(diff)} zu wenig.` });
        else if (pos.satz > preise.at(-1))
          auf.pruefungen.push({ status: "info", titel: `${pos.name}: über Listenpreis`, text: `Abgerechnet ${euro(pos.satz)}/${pos.einheit}, laut Preisliste ${listenText} (${euro(diff)} mehr).` });
        else
          auf.pruefungen.push({ status: "hinweis", titel: `${pos.name}: passt zu keiner Staffel`, text: `Abgerechnet ${euro(pos.satz)}/${pos.einheit}, laut Preisliste ${listenText}.` });
      }
    }
  }
  return { verglichen, ohne };
}
