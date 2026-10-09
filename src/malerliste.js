// Liest die Seiten "Lohnabrechnung Arbeiter" (Aufträge mit Positionen und Preisen).
//
// Aufbau, wie er in den Lohnzetteln vorkommt:
// - Eigene Seite ("Name: Max Muster"): eigene Positionen. Wird so ausbezahlt.
// - Team-Seite ("Name: A + B"): gemeinsame Positionen, Summe ÷ Anzahl Arbeiter = Anteil.
//   Dieselbe Team-Seite kann mehrfach im PDF stehen (einmal je Arbeiter, Namen vertauscht).
// - Hat ein Auftrag beides, steht auf der eigenen Seite eine Zeile "Anteil aus A+B" mit dem Team-Anteil.
// - Zuschlagsspalten 50 % / 10 %: Betrag = Satz × (Menge + 0,5 × Menge50 + 0,1 × Menge10)
import { zahl, zeilenText } from "./parser.js?v=0.19";

const ZAHL = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/; // hier steht das Minus vorne ("-36,20 €")
const MONATE = { JÄNNER: "01", JANUAR: "01", FEBRUAR: "02", MÄRZ: "03", APRIL: "04", MAI: "05", JUNI: "06", JULI: "07", AUGUST: "08", SEPTEMBER: "09", OKTOBER: "10", NOVEMBER: "11", DEZEMBER: "12" };

// Rechte Kanten der Spalten (Querformat): Anzahl ~527, 50% ~606, 10% ~653, Euro ~707, Gesamt ~791
const SPALTEN = { menge: 527, p50: 606, p10: 653, satz: 707, gesamt: 791 };
function spalte(r) {
  let best = null, abst = 15;
  for (const [n, k] of Object.entries(SPALTEN)) if (Math.abs(r - k) < abst) { best = n; abst = Math.abs(r - k); }
  return best;
}
const ohneEuro = (t) => t.replace(/\s*€$/, "").trim();
const zahlenIn = (l) => l.zellen.map((z) => ohneEuro(z.text)).filter((x) => ZAHL.test(x)).map(zahl);

// "A + B" und "B+A" sind dasselbe Team
export const teamSchluessel = (name) => name.split("+").map((s) => s.trim()).filter(Boolean).sort().join(" + ");

export function istArbeiterSeite(zeilen) {
  return zeilen.slice(0, 3).some((l) => /Lohnabrechnung Arbeiter/.test(zeilenText(l)));
}

export function leseArbeiterSeite(zeilen) {
  const texte = zeilen.map(zeilenText);
  const alles = texte.join("\n");
  const m = alles.match(/Lohnabrechnung Arbeiter\s+([A-ZÄÖÜ]+)\s+(20\d\d)/);
  const monat = m && MONATE[m[1]] ? `${m[2]}-${MONATE[m[1]]}` : null;
  const name = (alles.match(/Name:\s*(.+)/) || [])[1]?.trim() ?? "";
  const auftrag = (alles.match(/Auftrag-?Nr\.:\s*(\d+)/) || [])[1] ?? null;
  const seite = +((alles.match(/Seite\s+(\d+)/) || [])[1] ?? 1);
  const d = alles.match(/vom:\s*(\d\d)\.(\d\d)\.(\d{4})/);
  const vom = d ? `${d[3]}-${d[2]}-${d[1]}` : "";

  const iKopf = texte.findIndex((t) => /^AuftragNr\.\s+ausgef/.test(t));
  const iSumme = texte.findIndex((t) => /Summe( Stunden)?:/.test(t));
  const ende = iSumme >= 0 ? iSumme : zeilen.length;

  let gewerk = "";
  const positionen = [], unklar = [];
  for (let i = iKopf + 1; i < ende; i++) {
    const l = zeilen[i];
    if (/^vom:/.test(texte[i])) continue;
    if (l.zellen[0].x < 110) { gewerk = l.zellen.slice(1).map((z) => z.text).join(" "); continue; }

    const anteilAus = texte[i].match(/^Anteil aus (.+?)\s+€/);
    if (anteilAus) {
      positionen.push({ name: `Anteil aus ${anteilAus[1]}`, anteilAus: teamSchluessel(anteilAus[1]), gesamt: zahlenIn(l).at(-1) });
      continue;
    }
    const pos = { name: "", einheit: "" };
    for (const z of l.zellen) {
      const t = ohneEuro(z.text);
      if (ZAHL.test(t)) {
        const s = spalte(z.r);
        if (s) pos[s] = zahl(t);
        else unklar.push(texte[i]);
      } else if (z.text === "€") {
        // Währungszeichen der Euro-Spalte
      } else if (z.x > 525 && z.x < 560) pos.einheit = z.text;
      else pos.name += (pos.name ? " " : "") + z.text;
    }
    if (pos.gesamt === undefined && pos.menge === undefined) {
      // Umbruch einer langen Bezeichnung -> an die vorige Position anhängen
      if (positionen.length) positionen.at(-1).name += " " + pos.name;
      continue;
    }
    pos.tagespauschale = /Tagespauschale/i.test(pos.name);
    positionen.push(pos);
  }

  let summe = null, summeStunden = null, anzahlArbeiter = 1, anteil = null;
  if (iSumme >= 0) {
    for (let i = iSumme; i < zeilen.length; i++) {
      const t = texte[i], nums = zahlenIn(zeilen[i]);
      if (/Summe( Stunden)?:/.test(t)) {
        summe = nums.at(-1) ?? null;
        if (/Summe Stunden:/.test(t) && nums.length > 1) summeStunden = nums[0];
      }
      const a = t.match(/Anzahl Arbeiter:\s*(\d+)/);
      if (a) { anzahlArbeiter = +a[1]; anteil = nums.at(-1) ?? null; }
    }
  }
  const team = name.includes("+");
  return { monat, name, team, schluessel: teamSchluessel(name), auftrag, seite, vom, gewerk, positionen, summe, summeStunden, anzahlArbeiter, anteil, unklar };
}

// Seiten eines Monats zu Abrechnungen zusammenführen.
// - "Seite 2, 3 …" wird an die vorige Seite desselben Auftrags angehängt.
// - Dieselbe Abrechnung doppelt (z. B. Team-Seite mit vertauschten Namen) zählt einmal.
// - Liegt ein Auftrag für dieselbe Person/dasselbe Team in mehreren VERSIONEN vor
//   (andere Beträge oder anderes Datum), gilt die neueste; bei gleichem Datum die erste.
export function fasseAbrechnungenZusammen(seiten) {
  const versionen = [];
  for (const s of seiten) {
    const vorige = versionen.findLast((v) => v.auftrag === s.auftrag && v.schluessel === s.schluessel);
    if (s.seite > 1 && vorige) {
      vorige.positionen.push(...s.positionen);
      vorige.unklar.push(...s.unklar);
      for (const k of ["summe", "summeStunden", "anteil"]) if (s[k] != null) vorige[k] = s[k];
      if (s.anzahlArbeiter > 1) vorige.anzahlArbeiter = s.anzahlArbeiter;
      continue;
    }
    versionen.push({ ...s, positionen: [...s.positionen], unklar: [...s.unklar] });
  }
  const gruppen = new Map(), gesehen = new Set();
  for (const v of versionen) {
    const inhalt = JSON.stringify([v.auftrag, v.schluessel, v.positionen, v.summe, v.anteil]);
    if (gesehen.has(inhalt)) continue;
    gesehen.add(inhalt);
    const key = `${v.auftrag}|${v.schluessel}`;
    if (!gruppen.has(key)) gruppen.set(key, []);
    gruppen.get(key).push(v);
  }
  return [...gruppen.values()].map((liste) => {
    const neueste = liste.reduce((best, v) => (v.vom > best.vom ? v : best), liste[0]);
    return { ...neueste, versionen: liste };
  });
}

// Was steht dir für einen Auftrag zu? Eigene Seite vorhanden -> deren Summe
// (enthält die "Anteil aus"-Zeilen). Sonst die Summe der Team-Anteile.
// `wahl` kann für einzelne Abrechnungen eine andere Version vorgeben (für den Abgleich).
export function betragFuerAuftrag(liste, wahl = new Map()) {
  const v = (a) => wahl.get(a) ?? a;
  const eigene = liste.filter((a) => !a.team), teams = liste.filter((a) => a.team);
  const b = eigene.length
    ? eigene.reduce((s, a) => s + (v(a).summe ?? 0), 0)
    : teams.reduce((s, a) => s + (v(a).anteil ?? v(a).summe ?? 0), 0);
  return Math.round(b * 100) / 100;
}

export function auftraegeAusAbrechnungen(abrechnungen) {
  const nachAuftrag = new Map();
  for (const a of abrechnungen) {
    if (!nachAuftrag.has(a.auftrag)) nachAuftrag.set(a.auftrag, []);
    nachAuftrag.get(a.auftrag).push(a);
  }
  return [...nachAuftrag.entries()].map(([auftrag, liste]) => ({
    auftrag,
    abrechnungen: liste,
    eigene: liste.filter((a) => !a.team),
    teams: liste.filter((a) => a.team),
    betrag: betragFuerAuftrag(liste),
  }));
}
