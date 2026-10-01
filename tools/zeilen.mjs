// Gibt eine Seite als Zeilen aus (Entwicklung).
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
import { zeilenAusItems, zeilenText } from "../src/parser.js";
const [file, ...seiten] = process.argv.slice(2);
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), password: process.env.LOHN_PW, isEvalSupported: false, verbosity: 0 }).promise;
console.log("Seiten:", doc.numPages);
for (const s of seiten.length ? seiten.map(Number) : [...Array(doc.numPages).keys()].map((i) => i + 1)) {
  console.log(`--- Seite ${s}`);
  for (const l of zeilenAusItems((await (await doc.getPage(s)).getTextContent()).items)) console.log(`${l.y.toFixed(0).padStart(4)} | ${l.zellen.map((z) => `${z.text}@${z.x.toFixed(0)}`).join("  ")}`);
}
