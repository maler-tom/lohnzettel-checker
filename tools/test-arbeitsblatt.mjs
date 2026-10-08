// Testet Brutto-Check, Positionsabgleich und Umbuchungen gegen echte Zettel (nur lokal).
// Aufruf: LOHN_PW=... node tools/test-arbeitsblatt.mjs <PDF oder Ordner> [...]
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
import path from "node:path";
import { zeilenAusItems } from "../src/parser.js";
import { werteAus } from "../src/auswertung.js";
import { vorzeichenEuro } from "../src/abgleich.js";

const dateien = process.argv.slice(2).flatMap((p) => fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((f) => f.endsWith(".pdf")).sort().map((f) => path.join(p, f)) : [p]);
for (const datei of dateien) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(datei)), password: process.env.LOHN_PW, isEvalSupported: false, verbosity: 0 }).promise;
  const seiten = [];
  for (let n = 1; n <= doc.numPages; n++) seiten.push(zeilenAusItems((await (await doc.getPage(n)).getTextContent()).items));
  const m = werteAus(seiten);
  if (!m) continue;
  console.log(`\n=== ${m.monat}  Status ${m.status}`);
  for (const b of m.brutto) console.log(`  BRUTTO ${b.status.padEnd(6)} ${b.titel}: ${b.wert} | ${b.text}`);
  const ab = m.arbeitsblatt;
  if (!ab) { console.log("  (keine Arbeitsblätter)"); continue; }
  for (const a of ab.abgleich) {
    const abw = a.zeilen.filter((z) => z.status !== "ok");
    console.log(`  [${a.auftrag}] ${a.zeitraum}${a.vormonat ? " VORMONAT" : ""}${a.laeuftWeiter ? " LÄUFT WEITER" : ""} – ${a.zeilen.length} Pos., ${abw.length} abweichend${a.aufteilung ? ` | Aufteilung ${a.aufteilung.summe} ÷ ${a.aufteilung.anzahl} = ${a.aufteilung.anteil} (${a.aufteilung.ok ? "ok" : "FALSCH"})` : ""}`);
    for (const z of abw) console.log(`      ${z.status.padEnd(7)} ${z.art.padEnd(10)} ${z.erklaerung}`);
    for (const h of a.hinweise) console.log(`      ${h.status.padEnd(7)} ${h.text}`);
  }
  for (const g of ab.umbuchungen) console.log(`  UMBUCHUNG ${g.menge} ${g.einheit}: ${g.von.auftrag} → ${g.nach.auftrag}, netto ${vorzeichenEuro(g.netto)} ${g.warnungen.join(" ")}`);
  console.log(`  NETTO-WIRKUNG ${vorzeichenEuro(ab.netto)}`);
}
