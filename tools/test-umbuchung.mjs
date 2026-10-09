// Testet die Umbuchung im selben Auftrag mit erfundenen Zahlen (keine echten Lohnzettel).
// Aufruf: node tools/test-umbuchung.mjs
import { positionsAbgleich, nettoWirkung } from "../src/abgleich.js";

const blatt = (auftrag, positionen) => ({ auftrag, daten: ["2026-09-10"], zusaetzlich: [], ort: "", tage: 1, positionen: positionen.map(([name, menge, einheit = "m²"]) => ({ name, menge, einheit, plus: false })) });
const abrechnung = (auftrag, positionen) => ({
  auftrag, teams: [], eigene: [{}],
  abrechnungen: [{ team: false, anzahlArbeiter: 1, positionen: positionen.map(([name, menge, satz, einheit = "m²"]) => ({ name, einheit, menge, satz, gesamt: Math.round(menge * satz * 100) / 100 })) }],
});
const pruefe = (blaetter, auftraege) => positionsAbgleich(blaetter, { auftraege, regiesatz: 18.10 }, "2026-09");

let fehler = 0;
const erwarte = (titel, ok, info = "") => { console.log(`${ok ? "OK   " : "FALSCH"} ${titel}${ok ? "" : `  ${info}`}`); if (!ok) fehler++; };
const zeile = (ab, name) => ab.flatMap((a) => a.zeilen).find((z) => z.name === name);
const umb = (ab) => ab.flatMap((a) => a.zeilen).filter((z) => z.umbuchung);

// 1) Toms Beispiel: 200 m² Leimfarbe eingereicht, 100 m² abgerechnet, 100 m² als Raufaserfarbe – gleicher Preis
{
  const ab = pruefe([blatt("20260001", [["Leimfarbe abscheren", 200]])],
    [abrechnung("20260001", [["Leimfarbe abscheren", 100, 0.60], ["Raufaserfarbe abscheren", 100, 0.60]])]);
  const u = umb(ab);
  erwarte("1 Umbuchung gefunden", u.length === 1, JSON.stringify(u.map((x) => x.name)));
  erwarte("Text Leimfarbe → Raufaserfarbe", u[0]?.name === "Leimfarbe abscheren → Raufaserfarbe abscheren" && u[0].umbuchung.menge === 100);
  erwarte("grün (Menge und € gleich)", u[0]?.status === "ok", u[0]?.status);
  erwarte("Leimfarbe nicht mehr rot", zeile(ab, "Leimfarbe abscheren").status !== "fehler" && zeile(ab, "Leimfarbe abscheren").ausgeglichen);
  erwarte("Raufaserfarbe ausgeglichen", zeile(ab, "Raufaserfarbe abscheren").ausgeglichen);
  erwarte("Netto ±0", nettoWirkung(ab) === 0, nettoWirkung(ab));
  erwarte("Erklärung vorhanden", /umgebucht/.test(u[0]?.erklaerung) && /gleichen sich aus/.test(u[0]?.erklaerung), u[0]?.erklaerung);
}

// 2) Gleiche Menge, anderer m²-Preis: orange mit €-Differenz (100 m² × (0,48 − 0,60) = −12,00 €)
{
  const ab = pruefe([blatt("20260002", [["Leimfarbe abscheren", 200]])],
    [abrechnung("20260002", [["Leimfarbe abscheren", 100, 0.60], ["Raufaserfarbe abscheren", 100, 0.48]])]);
  const u = umb(ab)[0];
  erwarte("orange", u?.status === "hinweis", u?.status);
  erwarte("−12,00 €", u?.euroDein === -12, u?.euroDein);
  erwarte("Grund im Text", /−12,00 € durch anderen m²-Preis/.test(u?.erklaerung), u?.erklaerung);
  erwarte("Netto −12,00 €", nettoWirkung(ab) === -12, nettoWirkung(ab));
}

// 3) Teilausgleich: 100 m² gekürzt, nur 60 m² anderswo dazu -> 40 m² bleiben rot
{
  const ab = pruefe([blatt("20260003", [["Leimfarbe abscheren", 200]])],
    [abrechnung("20260003", [["Leimfarbe abscheren", 100, 0.60], ["Raufaserfarbe abscheren", 60, 0.60]])]);
  const u = umb(ab)[0], l = zeile(ab, "Leimfarbe abscheren");
  erwarte("60 m² umgebucht, grün", u?.umbuchung.menge === 60 && u.status === "ok", JSON.stringify(u?.umbuchung));
  erwarte("Rest −40 m² rot", l.status === "fehler" && l.diff === -40 && l.euroDein === -24, `${l.status} ${l.diff} ${l.euroDein}`);
  erwarte("Rest in der Erklärung", /bleiben −40,00 m² ohne Ausgleich/.test(l.erklaerung), l.erklaerung);
  erwarte("Netto −24,00 €", nettoWirkung(ab) === -24, nettoWirkung(ab));
}

// 4) Verschiedene Aufträge: KEIN Ausgleich, Kürzung bleibt rot
{
  const ab = pruefe([blatt("20260004", [["Leimfarbe abscheren", 200]]), blatt("20260005", [["Raufaserfarbe abscheren", 50]])],
    [abrechnung("20260004", [["Leimfarbe abscheren", 100, 0.60]]), abrechnung("20260005", [["Raufaserfarbe abscheren", 150, 0.60]])]);
  erwarte("keine Umbuchung über Aufträge", umb(ab).length === 0);
  erwarte("Leimfarbe bleibt rot", zeile(ab, "Leimfarbe abscheren").status === "fehler");
}

// 5) Andere Einheit: kein Ausgleich (m² gegen Std)
{
  const ab = pruefe([blatt("20260006", [["Leimfarbe abscheren", 200], ["Abscheren Decke", 1, "Std"]])],
    [abrechnung("20260006", [["Leimfarbe abscheren", 100, 0.60], ["Abscheren Decke", 3, 18.10, "Std"]])]);
  erwarte("keine Umbuchung m² ↔ Std", umb(ab).length === 0);
  erwarte("Leimfarbe bleibt rot", zeile(ab, "Leimfarbe abscheren").status === "fehler");
}

// 6) Gestrichen + neu mit mehreren offenen Positionen: das Stichwort entscheidet, der Rest ohne Stichwort bleibt rot
{
  const ab = pruefe([blatt("20260007", [["Leimfarbe abscheren", 120], ["Spachteln - 1x", 30], ["Vorstreichen", 50]])],
    [abrechnung("20260007", [["Raufaserfarbe abscheren", 120, 0.60], ["Spachteln - 1x", 40, 0.90], ["Grundieren", 20, 0.50]])]);
  const u = umb(ab);
  erwarte("nur Leimfarbe → Raufaserfarbe", u.length === 1 && u[0].umbuchung.von === "Leimfarbe abscheren" && u[0].umbuchung.nach === "Raufaserfarbe abscheren", JSON.stringify(u.map((x) => x.name)));
  erwarte("Vorstreichen bleibt rot", zeile(ab, "Vorstreichen").status === "fehler");
  erwarte("Spachteln bleibt erhöht", zeile(ab, "Spachteln - 1x").status === "plus");
}

// 7) Ohne Stichwort, aber einzige Kürzung + Erhöhung derselben Einheit: Umbuchung, aber immer orange
{
  const ab = pruefe([blatt("20260008", [["Vorstreichen", 100], ["Grundieren", 50]])],
    [abrechnung("20260008", [["Vorstreichen", 60, 0.50], ["Grundieren", 90, 0.50]])]);
  const u = umb(ab)[0];
  erwarte("Umbuchung ohne Stichwort orange", u?.status === "hinweis" && /kein gemeinsames Stichwort/.test(u.erklaerung), u?.status);
}

// 8) Gleiche Fläche (September 2026): Leimfarbe 169,57 + Raufaser 60,47 eingereicht, Leimfarbe nur 109,10 abgerechnet
{
  const ab = pruefe([blatt("20260009", [["Leimfarbe abscheren", 169.57], ["Rauhfaseranstrich entfernen", 60.47], ["Streichen - 2x weiß", 169.57]])],
    [abrechnung("20260009", [["Leimfarbe abscheren", 109.10, 0.60], ["Rauhfaseranstrich entfernen", 60.47, 0.70], ["Streichen - 2x weiß", 169.57, 1.00]])]);
  const l = zeile(ab, "Leimfarbe abscheren");
  erwarte("gleiche Fläche grün", l.status === "ok" && l.art === "flaeche", `${l.status} ${l.art}`);
  erwarte("Erklärung gleiche Fläche", /genau die Fläche von „Rauhfaseranstrich entfernen“/.test(l.erklaerung), l.erklaerung);
  erwarte("Netto ±0", nettoWirkung(ab) === 0, nettoWirkung(ab));
}

// 9) Kürzung NICHT genau so groß wie die andere Fläche (80 gekürzt, Raufaser 60): Zufall, alles bleibt rot
{
  const ab = pruefe([blatt("20260010", [["Leimfarbe abscheren", 200], ["Rauhfaseranstrich entfernen", 60]])],
    [abrechnung("20260010", [["Leimfarbe abscheren", 120, 0.60], ["Rauhfaseranstrich entfernen", 60, 0.70]])]);
  const l = zeile(ab, "Leimfarbe abscheren");
  erwarte("−80 m² bleibt rot", l.status === "fehler" && l.diff === -80 && l.euroDein === -48 && !l.flaeche, `${l.status} ${l.diff} ${l.euroDein}`);
}

// 10) Keine Entfernungsarbeit: Streichen gekürzt um genau die Menge einer anderen Position -> bleibt rot
{
  const ab = pruefe([blatt("20260011", [["Streichen - 2x weiß", 200], ["Vorstreichen", 60]])],
    [abrechnung("20260011", [["Streichen - 2x weiß", 140, 1.00], ["Vorstreichen", 60, 0.52]])]);
  erwarte("Streichen bleibt rot", zeile(ab, "Streichen - 2x weiß").status === "fehler");
}

// 11) Überscheren um genau die Abscher-Fläche gekürzt (Februar 2026): grün
{
  const ab = pruefe([blatt("20260012", [["Leimfarbe abscheren", 200], ["Überscheren und abkehren", 200]])],
    [abrechnung("20260012", [["Leimfarbe abscheren", 200, 0.60]])]);
  const u = zeile(ab, "Überscheren und abkehren");
  erwarte("Überscheren gestrichen = Abscher-Fläche grün", u.status === "ok" && u.art === "flaeche", `${u.status} ${u.art}`);
  erwarte("Erklärung Überscheren", /nicht extra bezahlt/.test(u.erklaerung) && !/steht dir zu/.test(u.erklaerung), u.erklaerung);
  erwarte("Netto ±0", nettoWirkung(ab) === 0, nettoWirkung(ab));
}

// 12) Überscheren gekürzt um zwei Abscher-Positionen zusammen (Juli 2026: 27,75 + 14,26 = 42,01)
{
  const ab = pruefe([blatt("20260013", [["Tapeten entfernen - inkl. Leimfarbe abscheren", 27.75], ["Leimfarbe abscheren", 14.26], ["Überscheren und abkehren", 188.23]])],
    [abrechnung("20260013", [["Tapeten entfernen - inkl. Leimfarbe abscheren", 27.75, 1.20], ["Leimfarbe abscheren", 14.26, 0.60], ["Überscheren und abkehren", 146.22, 0.12]])]);
  erwarte("Summe beider Abscher-Positionen grün", zeile(ab, "Überscheren und abkehren").status === "ok");
}

// 13) Überscheren gekürzt, aber nicht um die Abscher-Fläche: bleibt rot mit „steht dir zu“
{
  const ab = pruefe([blatt("20260014", [["Leimfarbe abscheren", 60], ["Überscheren und abkehren", 200]])],
    [abrechnung("20260014", [["Leimfarbe abscheren", 60, 0.60], ["Überscheren und abkehren", 150, 0.12]])]);
  const u = zeile(ab, "Überscheren und abkehren");
  erwarte("Überscheren −50 bleibt rot", u.status === "fehler" && /steht dir zu/.test(u.erklaerung), u.status);
}

console.log(fehler ? `\n${fehler} Test(s) FALSCH` : "\nAlle Tests OK");
process.exit(fehler ? 1 : 0);
