// Rechenprüfungen für eine ausgelesene Gehaltsseite.
// Regeln verifiziert an 33 echten Lohnzetteln (Jän 2024 – Sep 2026), alle centgenau.

// Sätze je Jahr. Ein Jahr ohne eigenen Eintrag nimmt den letzten bekannten Stand.
export const SAETZE = {
  2024: { svLfd: 0.1807, svSz: 0.1707, lstSz: 0.06, szFreibetrag: 620, mv: 0.0153 },
};

// Arbeitslosenversicherung (Dienstnehmer, normal 2,95 %) sinkt bei geringem Monatsbezug.
// Grenzen je Jahr laut ÖGK: bis g0 = 0 %, bis g1 = 1 %, bis g2 = 2 %, darüber 2,95 %.
// Gilt für den laufenden Bezug und jede Sonderzahlung getrennt.
const AV_VOLL = 0.0295;
export const AV_GRENZEN = {
  2024: [1951, 2128, 2306],
  2025: [2074, 2262, 2451],
  2026: [2225, 2427, 2630],
};
// Liefert { satz, avSatz } für eine Beitragsgrundlage (normaler Satz minus AV-Kürzung)
export function svSatzFuer(vollSatz, basis, jahr) {
  const jahre = Object.keys(AV_GRENZEN).map(Number).sort((a, b) => a - b);
  const g = AV_GRENZEN[jahre.filter((j) => j <= jahr).at(-1) ?? jahre[0]];
  const avSatz = basis <= g[0] ? 0 : basis <= g[1] ? 0.01 : basis <= g[2] ? 0.02 : AV_VOLL;
  return { satz: r4(vollSatz - AV_VOLL + avSatz), avSatz };
}
const r4 = (x) => Math.round(x * 10000) / 10000;
export function saetzeFuer(jahr) {
  const jahre = Object.keys(SAETZE).map(Number).sort((a, b) => a - b);
  const passend = jahre.filter((j) => j <= jahr).at(-1) ?? jahre[0];
  return SAETZE[passend];
}

// Bekannte Bezugsarten (Code -> Bedeutung). Unbekannte werden angezeigt, nicht verworfen.
export const BEZUGSARTEN = {
  135: "Monatslohn (Akkord/Zeitlohn)",
  295: "Sonn- und Feiertagsentgelt",
  380: "Urlaubsentgelt",
  381: "Übersiedlungstag",
  410: "Krankenentgelt",
  451: "Reisekosten (steuerfrei)",
  452: "Tagegeld Stadtgebiet",
  500: "Weihnachtsremuneration",
  510: "Urlaubszuschuss",
};
const istReisekosten = (code) => code === "451";
const istSonderzahlung = (code) => /^5\d\d$/.test(code);

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const gleich = (a, b, tol = 0.011) => a != null && b != null && Math.abs(a - b) <= tol;
export const euro = (x) =>
  x == null ? "–" : x.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
// Erklärung, wenn wegen geringem Bezug weniger Arbeitslosenversicherung anfällt
const avText = (avSatz) => avSatz < AV_VOLL
  ? ` Wegen des geringeren Bezugs zahlt man in diesem Monat nur ${prozent(avSatz)} statt ${prozent(AV_VOLL)} Arbeitslosenversicherung. Das ist richtig so.`
  : "";
const prozent = (x) => (x * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " %";

// Status: "ok" (passt), "hinweis" (auffällig, aber erklärbar), "fehler" (rechnerisch falsch), "info"
export function pruefe(z) {
  const p = [];
  const add = (status, titel, text, soll, ist) => p.push({ status, titel, text, soll, ist });
  const s = z.summen;
  const jahr = z.monat ? +z.monat.slice(0, 4) : new Date().getFullYear();
  const satz = saetzeFuer(jahr);
  const dezember = z.monat?.endsWith("-12");

  // 1) Jede Zeile: Menge × Satz = Betrag
  for (const b of z.bezuege) {
    if (b.menge == null || b.satz == null) continue;
    const soll = r2(b.menge * b.satz);
    // Der gedruckte Satz ist auf 2 Stellen gerundet -> Toleranz wächst mit der Menge
    const tol = Math.abs(b.menge) * 0.005 + 0.011;
    if (!gleich(soll, b.betrag, tol))
      add("fehler", `${b.name}: Menge × Satz`, `${b.menge.toLocaleString("de-DE")} × ${euro(b.satz)} ergibt ${euro(soll)}, gedruckt sind ${euro(b.betrag)}.`, soll, b.betrag);
  }
  const zeilenOk = !p.length;
  if (zeilenOk) add("ok", "Zeilen: Menge × Satz", "Jede Bezugszeile ist richtig ausgerechnet.");

  // 2) Unbekannte Bezugsarten
  const unbekannt = z.bezuege.filter((b) => !BEZUGSARTEN[b.code]);
  if (unbekannt.length)
    add("hinweis", "Unbekannte Bezugsart", `${unbekannt.map((b) => `${b.code} ${b.name}`).join(", ")}: kenne ich noch nicht. Ich zähle sie zur SV-Basis dazu.`);

  // 3) Summe der Bezüge
  const summe = r2(z.bezuege.reduce((a, b) => a + b.betrag, 0));
  add(gleich(summe, z.summeBezuege) ? "ok" : "fehler", "Summe der Bezüge",
    gleich(summe, z.summeBezuege) ? `Alle Zeilen ergeben zusammen ${euro(summe)}.` : `Die Zeilen ergeben ${euro(summe)}, gedruckt sind ${euro(z.summeBezuege)}.`, summe, z.summeBezuege);

  if (!s) {
    add("fehler", "SV / Lohnsteuer", "Den Block mit Sozialversicherung und Lohnsteuer konnte ich nicht lesen.");
    return p;
  }

  // 4) SV-Basis laufend = alle Bezüge außer Reisekosten und Sonderzahlungen
  const basisLfd = r2(z.bezuege.filter((b) => !istReisekosten(b.code) && !istSonderzahlung(b.code)).reduce((a, b) => a + b.betrag, 0));
  add(gleich(basisLfd, s.svBasisLfd) ? "ok" : "fehler", "SV-Basis",
    gleich(basisLfd, s.svBasisLfd)
      ? `Alle Bezüge ohne Reisekosten und Sonderzahlungen: ${euro(basisLfd)}.`
      : `Erwartet ${euro(basisLfd)} (alle Bezüge ohne Reisekosten und Sonderzahlungen), gedruckt ${euro(s.svBasisLfd)}.`,
    basisLfd, s.svBasisLfd);

  // 5) SV laufend
  const svLfd = svSatzFuer(satz.svLfd, s.svBasisLfd, jahr);
  const svSoll = r2(s.svBasisLfd * svLfd.satz);
  add(gleich(svSoll, s.svLfd) ? "ok" : "fehler", "Sozialversicherung",
    `${prozent(svLfd.satz)} von ${euro(s.svBasisLfd)} = ${euro(svSoll)}` + (gleich(svSoll, s.svLfd) ? "." : `, abgezogen wurden ${euro(s.svLfd)}.`) + avText(svLfd.avSatz), svSoll, s.svLfd);

  // 6) LSt-Basis laufend
  const lstBasisSoll = r2(s.svBasisLfd - s.svLfd);
  if (gleich(lstBasisSoll, s.lstBasisLfd)) {
    add("ok", "Lohnsteuer-Basis", `SV-Basis minus SV = ${euro(lstBasisSoll)}.`);
  } else if (s.svBasisSz && s.lstBasisLfd > lstBasisSoll) {
    add("hinweis", "Lohnsteuer-Basis", `Um ${euro(r2(s.lstBasisLfd - lstBasisSoll))} höher als SV-Basis minus SV. Vermutlich wurde das Jahressechstel überschritten, und dieser Teil der Sonderzahlung wird normal versteuert. Das ist meist kein Fehler.`, lstBasisSoll, s.lstBasisLfd);
  } else {
    add("fehler", "Lohnsteuer-Basis", `Erwartet ${euro(lstBasisSoll)} (SV-Basis minus SV), gedruckt ${euro(s.lstBasisLfd)}.`, lstBasisSoll, s.lstBasisLfd);
  }

  // 7) Lohnsteuer laufend: Tarif, hier nur zur Info
  if (s.lstBasisLfd)
    add("info", "Lohnsteuer", `${euro(s.lstLfd)}, das sind ${prozent(s.lstLfd / s.lstBasisLfd)} der Lohnsteuer-Basis. Die genaue Höhe hängt vom Steuertarif ab und wird nicht nachgerechnet.`);

  // 8) Sonderzahlung (Urlaubszuschuss / Weihnachtsremuneration)
  const szBezug = r2(z.bezuege.filter((b) => istSonderzahlung(b.code)).reduce((a, b) => a + b.betrag, 0));
  if (szBezug || s.svBasisSz) {
    add(gleich(szBezug, s.svBasisSz) ? "ok" : "fehler", "Sonderzahlung: Basis",
      gleich(szBezug, s.svBasisSz) ? `${euro(szBezug)} Sonderzahlung, getrennt abgerechnet.` : `Sonderzahlung laut Zeilen ${euro(szBezug)}, als Basis gedruckt ${euro(s.svBasisSz)}.`, szBezug, s.svBasisSz);
    const svSz = svSatzFuer(satz.svSz, s.svBasisSz, jahr);
    const svSzSoll = r2(s.svBasisSz * svSz.satz);
    add(gleich(svSzSoll, s.svSz) ? "ok" : "fehler", "Sonderzahlung: SV",
      `${prozent(svSz.satz)} von ${euro(s.svBasisSz)} = ${euro(svSzSoll)}` + (gleich(svSzSoll, s.svSz) ? "." : `, abgezogen wurden ${euro(s.svSz)}.`) + avText(svSz.avSatz), svSzSoll, s.svSz);
    const lstSzSoll = r2(s.lstBasisSz * satz.lstSz);
    add(gleich(lstSzSoll, s.lstSz) ? "ok" : "fehler", "Sonderzahlung: Lohnsteuer",
      `${prozent(satz.lstSz)} von ${euro(s.lstBasisSz)} = ${euro(lstSzSoll)}` + (gleich(lstSzSoll, s.lstSz) ? "." : `, abgezogen wurden ${euro(s.lstSz)}.`), lstSzSoll, s.lstSz);
    const ohneFrei = r2(s.svBasisSz - s.svSz);
    if (gleich(ohneFrei - satz.szFreibetrag, s.lstBasisSz))
      add("info", "Sonderzahlung: Freibetrag", `Der Freibetrag von ${euro(satz.szFreibetrag)} wurde abgezogen (gibt es einmal im Jahr).`);
    else if (s.lstBasisSz < ohneFrei)
      add("info", "Sonderzahlung: Freibetrag", `Steuerpflichtig sind ${euro(s.lstBasisSz)} von ${euro(ohneFrei)} (Sonderzahlung minus SV). Der Freibetrag von ${euro(satz.szFreibetrag)} wurde wohl schon bei einer früheren Sonderzahlung verwendet.`);
  }

  // 9) Dezember-Korrekturen in den Lohnsteuer-Spalten
  const korr = r2(s.korrLstLfd + s.korrLstSz + s.korrSonst);
  if (korr)
    add("info", korr < 0 ? "Gutschrift" : "Nachverrechnung",
      `${euro(Math.abs(korr))} ${korr < 0 ? "weniger" : "mehr"} abgezogen (Korrektur in den Lohnsteuer-Spalten${dezember ? ", vermutlich die Lohnsteuer-Aufrollung zum Jahresende" : ""}). Ist in den Abzügen schon eingerechnet.`);

  // 10) Abzüge gesamt
  const abzSoll = r2(s.svLfd + s.lstLfd + s.svSz + s.lstSz + korr);
  add(gleich(abzSoll, s.abzuege) ? "ok" : "fehler", "Abzüge gesamt",
    gleich(abzSoll, s.abzuege) ? `SV + Lohnsteuer${korr ? " + Korrektur" : ""} = ${euro(abzSoll)}.` : `SV + Lohnsteuer ergeben ${euro(abzSoll)}, gedruckt ${euro(s.abzuege)}.`, abzSoll, s.abzuege);

  // 11) Sonstige Abzüge (e-Card, Vorschuss, ...)
  const sonst = r2(-z.sonstigeAbzuege.reduce((a, b) => a + b.betrag, 0));
  if (sonst || s.sonstigeAbzuegeGesamt) {
    add(gleich(sonst, s.sonstigeAbzuegeGesamt) ? "info" : "fehler", "Sonstige Abzüge",
      `${z.sonstigeAbzuege.map((b) => `${b.name} ${euro(-b.betrag)}`).join(", ")}` + (gleich(sonst, s.sonstigeAbzuegeGesamt) ? "." : `. Summe laut Zeilen ${euro(sonst)}, gedruckt ${euro(s.sonstigeAbzuegeGesamt)}.`));
  }

  // 12) Netto
  const nettoSoll = r2(z.summeBezuege - s.abzuege - sonst);
  add(gleich(nettoSoll, z.netto) ? "ok" : "fehler", "Auszahlung",
    `${euro(z.summeBezuege)} − ${euro(s.abzuege)}${sonst ? ` − ${euro(sonst)}` : ""} = ${euro(nettoSoll)}` + (gleich(nettoSoll, z.netto) ? "." : `, überwiesen wurden ${euro(z.netto)}.`), nettoSoll, z.netto);

  // 13) Mitarbeitervorsorge (zahlt die Firma, nur Kontrolle)
  if (z.mvBeitrag != null && z.mvBemLfd != null) {
    const mvSoll = r2((z.mvBemLfd + (z.mvBemSz ?? 0)) * satz.mv);
    add(gleich(mvSoll, z.mvBeitrag) ? "ok" : "hinweis", "Mitarbeitervorsorge (zahlt die Firma)",
      `${prozent(satz.mv)} von ${euro(r2(z.mvBemLfd + (z.mvBemSz ?? 0)))} = ${euro(mvSoll)}` + (gleich(mvSoll, z.mvBeitrag) ? "." : `, gedruckt ${euro(z.mvBeitrag)}.`));
  }

  return p;
}

export function gesamtStatus(pruefungen) {
  if (pruefungen.some((x) => x.status === "fehler")) return "fehler";
  if (pruefungen.some((x) => x.status === "hinweis")) return "hinweis";
  return "ok";
}
