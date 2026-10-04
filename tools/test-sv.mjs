// Testet die SV-Prüfung mit erfundenen Zahlen (keine echten Lohnzettel).
// Sollwerte von Hand aus den ÖGK-Sätzen gerechnet. Aufruf: node tools/test-sv.mjs
import { pruefe } from "../src/pruefungen.js";

function zettel(monat, lfd, svLfd, uz = 0, svSz = 0, gedruckteBasis = lfd) {
  const bezuege = [{ code: "135", name: "Monatslohn", betrag: lfd }];
  if (uz) bezuege.push({ code: "510", name: "Urlaubszuschuss", betrag: uz });
  return {
    monat, bezuege, summeBezuege: lfd + uz, sonstigeAbzuege: [],
    summen: { svBasisLfd: gedruckteBasis, svBasisSz: uz, lstBasisLfd: +(gedruckteBasis - svLfd).toFixed(2), lstBasisSz: 0,
      svLfd, svSz, lstLfd: 0, lstSz: 0, abzuege: +(svLfd + svSz).toFixed(2), korrLstLfd: 0, korrLstSz: 0, korrSonst: 0, sonstigeAbzuegeGesamt: 0 },
  };
}
const faelle = [
  // [Beschreibung, Zettel, Prüfung, erwarteter Status, Stichwort im Text]
  ["2026 normal 3.000 € → 18,07 % = 542,10", zettel("2026-03", 3000, 542.10), "Sozialversicherung", "ok"],
  ["2026 2.500 € → AV 2 % = 17,12 % = 428,00", zettel("2026-03", 2500, 428.00), "Sozialversicherung", "ok", "2 %"],
  ["2026 2.300 € → AV 1 % = 16,12 % = 370,76", zettel("2026-03", 2300, 370.76), "Sozialversicherung", "ok", "1 %"],
  ["2026 2.000 € → AV 0 % = 15,12 % = 302,40", zettel("2026-03", 2000, 302.40), "Sozialversicherung", "ok", "0 %"],
  ["2026 Grenze genau 2.630,00 € → noch 2 % = 450,26", zettel("2026-03", 2630, 450.26), "Sozialversicherung", "ok"],
  ["2026 2.630,01 € → schon 18,07 % = 475,24", zettel("2026-03", 2630.01, 475.24), "Sozialversicherung", "ok"],
  ["2026 Grenze genau 2.225,00 € → 0 % = 336,42", zettel("2026-03", 2225, 336.42), "Sozialversicherung", "ok"],
  ["2025 2.300 € → Grenzen 2025: 2 % = 393,76", zettel("2025-03", 2300, 393.76), "Sozialversicherung", "ok"],
  ["2024 2.000 € → Grenzen 2024: 1 % = 322,40", zettel("2024-03", 2000, 322.40), "Sozialversicherung", "ok"],
  ["Ab 63: 3.000 € × 15,12 % = 453,60", zettel("2026-03", 3000, 453.60), "Sozialversicherung", "hinweis", "63"],
  ["PV halb: 3.000 € × 12,945 % = 388,35", zettel("2026-03", 3000, 388.35), "Sozialversicherung", "hinweis", "halbe Pensionsversicherung"],
  ["PV halb + ab 63: 3.000 € × 9,995 % = 299,85", zettel("2026-03", 3000, 299.85), "Sozialversicherung", "hinweis", "keine Arbeitslosen"],
  ["Pensionist 2025: 453,60 − 112,98 = 340,62", zettel("2025-03", 3000, 340.62), "Sozialversicherung", "hinweis", "Alterspension und arbeitest"],
  ["Pensionist 2026 gibt's nicht mehr → Fehler", zettel("2026-03", 3000, 340.62), "Sozialversicherung", "fehler"],
  ["Lehrling 1.000 € × 11,92 % = 119,20", zettel("2026-03", 1000, 119.20), "Sozialversicherung", "hinweis", "Lehrling"],
  ["Lehrling 2.500 € × 13,07 % = 326,75", zettel("2026-03", 2500, 326.75), "Sozialversicherung", "hinweis", "Lehrling"],
  ["Wien 2026: 3.000 € × 18,32 % = 549,60", zettel("2026-03", 3000, 549.60), "Sozialversicherung", "hinweis", "Wien"],
  ["Höchstbeitragsgrundlage: 8.000 €, Basis 6.930 gedruckt → 1.252,25", zettel("2026-03", 8000, 1252.25, 0, 0, 6930), "Sozialversicherung", "ok"],
  ["Höchstbeitragsgrundlage: 8.000 € als Basis gedruckt → trotzdem 1.252,25", zettel("2026-03", 8000, 1252.25), "Sozialversicherung", "ok", "Höchstbeitrag"],
  ["  … und die SV-Basis ist dann auch ok", zettel("2026-03", 8000, 1252.25, 0, 0, 6930), "SV-Basis", "ok", "Höchstbeitrag"],
  ["Echter Fehler: 500 € zu viel abgezogen", zettel("2026-03", 3000, 1042.10), "Sozialversicherung", "fehler"],
  ["Echter Fehler: 10 € zu wenig, kein Sonderfall", zettel("2026-03", 3000, 532.10), "Sozialversicherung", "fehler"],
  ["AK-Beispiel Wien: 2.300 € × 16,37 % = 376,51", zettel("2026-03", 2300, 376.51), "Sozialversicherung", "hinweis", "Wien"],
  ["AK-Beispiel Wien: 7.000 €, Deckel 6.930 × 18,32 % = 1.269,58", zettel("2026-03", 7000, 1269.58), "Sozialversicherung", "hinweis", "Wien"],
  ["Wien 2025 gab's noch nicht → 18,32 % ist dort ein Fehler", zettel("2025-03", 3000, 549.60), "Sozialversicherung", "fehler"],
  ["Schlechtwetter-Satz 18,77 % bei Malern → bleibt Fehler", zettel("2026-03", 3000, 563.10), "Sozialversicherung", "fehler"],
  ["UZ 3.000 € → 17,07 % = 512,10", zettel("2026-06", 3000, 542.10, 3000, 512.10), "Sonderzahlung: SV", "ok"],
  ["ÖGK-Beispiel: Lohn 2.500 (2 %) + UZ 2.300 (1 %) → 15,12 % = 347,76", zettel("2026-06", 2500, 428.00, 2300, 347.76), "Sonderzahlung: SV", "ok", "1 %"],
  ["  … der laufende Teil im selben Monat mit 2 %", zettel("2026-06", 2500, 428.00, 2300, 347.76), "Sozialversicherung", "ok", "2 %"],
  ["UZ ab 63: 3.000 € × 14,12 % = 423,60", zettel("2026-06", 3000, 453.60, 3000, 423.60), "Sonderzahlung: SV", "hinweis", "63"],
  ["UZ bei PV halb: wird NICHT halbiert, 17,07 % = ok", zettel("2026-06", 3000, 388.35, 3000, 512.10), "Sonderzahlung: SV", "ok"],
];
let ok = 0;
for (const [name, z, titel, status, wort] of faelle) {
  const x = pruefe(z).find((p) => p.titel === titel);
  const passt = x && x.status === status && (!wort || x.text.includes(wort));
  ok += passt;
  console.log(`${passt ? "✔" : "✘"} ${name}${passt ? "" : `\n    erwartet ${status}${wort ? ` mit „${wort}"` : ""}, bekommen: ${x?.status} – ${x?.text}`}`);
}
console.log(`\n${ok} von ${faelle.length} Tests bestanden`);
process.exit(ok === faelle.length ? 0 : 1);
