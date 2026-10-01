// Zeigt die Text-Items einer Seite mit Positionen (nur zur Entwicklung).
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
const [file, pageNo = "1"] = process.argv.slice(2);
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), password: process.env.LOHN_PW, isEvalSupported: false }).promise;
const page = await doc.getPage(+pageNo);
const tc = await page.getTextContent();
for (const it of tc.items) if (it.str.trim()) console.log(it.transform[4].toFixed(1).padStart(6), it.transform[5].toFixed(1).padStart(6), (it.width).toFixed(1).padStart(6), JSON.stringify(it.str));
