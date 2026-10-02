// Testet die komplette Auswertung gegen echte Lohnzettel auf diesem PC.
// Aufruf: LOHN_PW=... [PREISLISTE=<pdf>] node tools/test-lokal.mjs <Ordner> [<Ordner> ...]
// Gibt Monat, Status und Auffälligkeiten aus. ALLE=1 zeigt auch die passenden Prüfungen.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
import path from "node:path";
import { zeilenAusItems } from "../src/parser.js";
import { werteAus, pruefePreisverlauf, pruefePreisliste } from "../src/auswertung.js";
import { lesePreisliste } from "../src/preisliste.js";

const nurAuffaellig = process.env.ALLE !== "1";
const monate = [];
for (const ordner of process.argv.slice(2)) {
  for (const datei of fs.readdirSync(ordner).filter((f) => f.toLowerCase().endsWith(".pdf")).sort()) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(ordner, datei))), password: process.env.LOHN_PW, isEvalSupported: false, verbosity: 0 }).promise;
    const seiten = [];
    for (let n = 1; n <= doc.numPages; n++) seiten.push(zeilenAusItems((await (await doc.getPage(n)).getTextContent()).items));
    const m = werteAus(seiten);
    if (m && !monate.some((x) => x.monat === m.monat && x.netto === m.netto)) monate.push(m);
  }
}
monate.sort((a, b) => (a.monat ?? "").localeCompare(b.monat ?? ""));
pruefePreisverlauf(monate, {}); // Preisvergleich mit den früheren Monaten
if (process.env.PREISLISTE) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.env.PREISLISTE)), isEvalSupported: false, verbosity: 0 }).promise;
  const seiten = [];
  for (let n = 1; n <= doc.numPages; n++) seiten.push(zeilenAusItems((await (await doc.getPage(n)).getTextContent()).items));
  const liste = lesePreisliste(seiten);
  if (process.env.FEHLER_TEST) monate.at(-1).maler.auftraege[0].abrechnungen[0].positionen.filter((p) => p.einheit === "m²").slice(0, 1).forEach((p) => { console.log(`(Test: ${p.name} von ${p.satz} auf ${p.satz - 0.1} gesenkt)`); p.satz = +(p.satz - 0.1).toFixed(2); });
  const r = pruefePreisliste(monate, liste);
  console.log(`Preisliste Stand ${liste.stand}, ${liste.anzahl} Artikel: ${r.verglichen} Positionen verglichen, ${r.ohne} ohne Zuordnung
`);
}
const zaehl = { ok: 0, hinweis: 0, fehler: 0 };
for (const m of monate) {
  zaehl[m.status]++;
  console.log(`${m.monat}  ${m.status.padEnd(7)}  Aufträge: ${m.maler.auftraege.length}  Regiesatz: ${m.maler.regiesatz ?? "-"}`);
  const zeige = (x, wo = "") => (!nurAuffaellig || x.status === "fehler" || x.status === "hinweis") && console.log(`     ${x.status.padEnd(7)} ${wo}${x.titel}: ${x.text}`);
  m.pruefungen.forEach((x) => zeige(x));
  m.maler.abgleich.forEach((x) => zeige(x));
  for (const a of m.maler.auftraege) a.pruefungen.forEach((x) => zeige(x, `[${a.auftrag}] `));
}
console.log(`
${monate.length} Monate: ${zaehl.ok} ok, ${zaehl.hinweis} mit Hinweis, ${zaehl.fehler} mit Fehler`);
