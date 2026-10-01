// Liest die Gehaltsseite eines Lohnzettels aus den Text-Items von pdf.js.
// Läuft identisch im Browser und in Node (keine Abhängigkeiten).
//
// Das Layout ist ein festes Formular in Festbreitenschrift (7,2 pt pro Zeichen).
// Zahlen sind rechtsbündig, deshalb ordnen wir sie über ihre RECHTE Kante einer Spalte zu.

const ZAHL = /^\d{1,3}(?:\.\d{3})*,\d{2}-?$/;

export function zahl(s) {
  const neg = s.endsWith("-");
  const v = parseFloat(s.replace(/-$/, "").replace(/\./g, "").replace(",", "."));
  return neg ? -v : v;
}

// pdf.js-Items -> Zeilen [{ y, zellen: [{ x, r, text }] }], von oben nach unten
export function zeilenAusItems(items) {
  const zellen = items
    .filter((it) => it.str && it.str.trim())
    .map((it) => {
      const text = it.str.trim();
      const zeichen = it.width / it.str.length;
      // Ein angehängtes Minus ragt eine Zeichenbreite über die Spalte hinaus
      const r = it.transform[4] + it.width - (text.endsWith("-") && ZAHL.test(text) ? zeichen : 0);
      return { x: it.transform[4], r, y: it.transform[5], text };
    });
  const zeilen = [];
  for (const z of zellen.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const zeile = zeilen.find((l) => Math.abs(l.y - z.y) < 2);
    if (zeile) zeile.zellen.push(z);
    else zeilen.push({ y: z.y, zellen: [z] });
  }
  zeilen.forEach((l) => l.zellen.sort((a, b) => a.x - b.x));
  return zeilen;
}

export const zeilenText = (l) => l.zellen.map((z) => z.text).join(" ");

export function istGehaltsseite(zeilen) {
  return zeilen.some((l) => /Summe der Bez/.test(zeilenText(l)));
}

// Spalten der Bezugszeilen (rechte Kante): Menge ~360, Satz ~446, Betrag ~547
// Spalten im Fußblock (rechte Kante): A ~151, B ~245, C ~346, D ~446, E ~547
function spalte(r, spalten) {
  let best = null;
  for (const [name, kante] of Object.entries(spalten)) {
    if (Math.abs(r - kante) <= 20 && (!best || Math.abs(r - kante) < Math.abs(r - spalten[best]))) best = name;
  }
  return best;
}
const BEZUG_SPALTEN = { menge: 360, satz: 446, betrag: 547 };
const FUSS_SPALTEN = { A: 151, B: 245, C: 346, D: 446, E: 547 };

function zahlenNachSpalte(zeile, spalten) {
  const out = {};
  for (const z of zeile.zellen) {
    if (!ZAHL.test(z.text)) continue;
    const s = spalte(z.r, spalten);
    if (s) out[s] = zahl(z.text);
  }
  return out;
}
const nurZahlen = (l) => l.zellen.every((z) => ZAHL.test(z.text));

// Bezugs-/Abzugszeile: "135 Monatslohn 169,00 2.945,80"
function codeZeile(l) {
  const [erste, ...rest] = l.zellen;
  if (!/^\d{3,4}$/.test(erste.text)) return null;
  const name = rest.filter((z) => !ZAHL.test(z.text)).map((z) => z.text).join(" ");
  return { code: erste.text, name, ...zahlenNachSpalte(l, BEZUG_SPALTEN) };
}

export function leseGehaltsseite(zeilen) {
  const texte = zeilen.map(zeilenText);
  const hinweise = [];

  const mon = texte.join("\n").match(/\b(0[1-9]|1[0-2])\.(20\d{2})\b/);
  const monat = mon ? `${mon[2]}-${mon[1]}` : null;

  const iEur = texte.findIndex((t) => /^EUR$/.test(t.trim()));
  const iSumme = texte.findIndex((t) => /Summe der Bez/.test(t));
  const iIban = texte.findIndex((t) => /^IBAN/.test(t.trim()));

  const bezuege = [];
  for (let i = iEur + 1; i < iSumme; i++) {
    const c = codeZeile(zeilen[i]);
    if (c && c.betrag !== undefined) bezuege.push(c);
  }
  const summeZahlen = zeilen[iSumme].zellen.filter((z) => ZAHL.test(z.text));
  const summeBezuege = summeZahlen.length ? zahl(summeZahlen.at(-1).text) : null;

  // Nach der Summe: sonstige Abzüge (8xx), Urlaubssaldo (904), MA-Vorsorge (97xx)
  const sonstigeAbzuege = [];
  let urlaubssaldo = null, mvBemLfd = null, mvBemSz = null, mvBeitrag = null;
  let iLetzteCodeZeile = iSumme;
  for (let i = iSumme + 1; i < (iIban < 0 ? zeilen.length : iIban); i++) {
    const c = codeZeile(zeilen[i]);
    if (!c) continue;
    iLetzteCodeZeile = i;
    const werte = zeilen[i].zellen.filter((z) => ZAHL.test(z.text)).map((z) => zahl(z.text));
    if (/^8\d\d$/.test(c.code)) sonstigeAbzuege.push({ code: c.code, name: c.name, betrag: werte.at(-1) });
    else if (c.code === "904") urlaubssaldo = werte[0];
    else if (c.code === "9710") mvBemLfd = werte.at(-1);
    else if (c.code === "9720") mvBemSz = werte.at(-1);
    else if (c.code === "9770") mvBeitrag = werte.at(-1);
  }

  // Fußblock: reine Zahlenzeilen zwischen letzter Codezeile und IBAN-Zeile
  const fuss = zeilen.slice(iLetzteCodeZeile + 1, iIban).filter(nurZahlen).map((l) => zahlenNachSpalte(l, FUSS_SPALTEN));
  // Beitragszeile = die Zeile mit Gesamt-Abzug (E) UND laufender SV (A)
  const iBeitrag = fuss.findIndex((f) => f.E !== undefined && f.A !== undefined);
  let summen = null;
  if (iBeitrag > 0) {
    const bem = fuss[iBeitrag - 1], bei = fuss[iBeitrag], korr = fuss.slice(iBeitrag + 1);
    const sonst = fuss.slice(0, iBeitrag - 1).find((f) => f.E !== undefined && Object.keys(f).length === 1);
    summen = {
      svBasisLfd: bem.A ?? null, svBasisSz: bem.B ?? 0,
      lstBasisLfd: bem.C ?? null, lstBasisSz: bem.D ?? 0,
      svLfd: bei.A ?? null, svSz: bei.B ?? 0,
      lstLfd: bei.C ?? null, lstSz: bei.D ?? 0,
      abzuege: bei.E,
      korrLstLfd: korr.reduce((s, f) => s + (f.C ?? 0), 0),
      korrLstSz: korr.reduce((s, f) => s + (f.D ?? 0), 0),
      korrSonst: korr.reduce((s, f) => s + (f.A ?? 0) + (f.B ?? 0) + (f.E ?? 0), 0),
      sonstigeAbzuegeGesamt: sonst ? sonst.E : 0,
    };
  } else {
    hinweise.push("Der Block mit Sozialversicherung und Lohnsteuer wurde nicht gefunden.");
  }

  let netto = null;
  if (iIban >= 0) {
    const n = zeilen[iIban].zellen.filter((z) => ZAHL.test(z.text));
    netto = n.length ? zahl(n.at(-1).text) : null;
  }

  return { monat, bezuege, summeBezuege, sonstigeAbzuege, urlaubssaldo, mvBemLfd, mvBemSz, mvBeitrag, summen, netto, hinweise };
}
