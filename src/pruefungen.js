// Rechenprüfungen für eine ausgelesene Gehaltsseite.
// Regeln verifiziert an 33 echten Lohnzetteln (Jän 2024 – Sep 2026), alle centgenau.

// Sätze je Jahr. Ein Jahr ohne eigenen Eintrag nimmt den letzten bekannten Stand.
export const SAETZE = {
  2024: { lstSz: 0.06, szFreibetrag: 620, mv: 0.0153 },
};

// Sozialversicherung, Dienstnehmer-Anteil (Quelle: ÖGK/WKO/AK „Meine Lohnabrechnung 2026“, gleich 2024–2026):
// PV 10,25 + KV 3,87 + AV 2,95 + AK-Umlage 0,5 + Wohnbauförderung 0,5 = 18,07 %.
// Sonderzahlungen ohne AK-Umlage und Wohnbauförderung = 17,07 %.
const AV_VOLL = 0.0295;
// Werte je Jahr (ÖGK), jeden Jänner nachtragen:
//  av: AV-Staffel bei geringem Bezug, bis av[0] = 0 %, bis av[1] = 1 %, bis av[2] = 2 %, darüber 2,95 %
//      (laufender Bezug und jede Sonderzahlung getrennt betrachtet)
//  hbg / hbgSz: Höchstbeitragsgrundlage monatlich / für Sonderzahlungen im Jahr
//  pensionistMax: PV-Entfall für erwerbstätige Pensionisten (nur 2024 und 2025, nicht verlängert)
export const SV_JAHR = {
  2024: { av: [1951, 2128, 2306], hbg: 6060, hbgSz: 12120, pensionistMax: 106.28 },
  2025: { av: [2074, 2262, 2451], hbg: 6450, hbgSz: 12900, pensionistMax: 112.98 },
  2026: { av: [2225, 2427, 2630], hbg: 6930, hbgSz: 13860 },
};
const svJahr = (jahr) => {
  const jahre = Object.keys(SV_JAHR).map(Number).sort((a, b) => a - b);
  return SV_JAHR[jahre.filter((j) => j <= jahr).at(-1) ?? jahre[0]];
};

// Soll-Beitrag für eine Beitragsgrundlage. fall = Sonderfall (siehe SV_FAELLE), {} = normal.
export function svSoll(basis, jahr, sz = false, fall = {}) {
  const j = svJahr(jahr);
  const g = j.av;
  const b = Math.min(basis, sz ? j.hbgSz : j.hbg); // über der Höchstbeitragsgrundlage wird nichts mehr fällig
  let av = basis <= g[0] ? 0 : basis <= g[1] ? 0.01 : basis <= g[2] ? 0.02 : AV_VOLL;
  let kv = 0.0387, pv = 0.1025, ak = 0.005, wbf = fall.wien ? 0.0075 : 0.005;
  if (fall.lehrling) { kv = 0.0167; ak = 0; wbf = 0; av = basis <= g[0] ? 0 : basis <= g[1] ? 0.01 : 0.0115; }
  if (fall.ab63) av = 0;
  if (fall.pvHalb && !sz) pv = 0.05125; // Halbierung gilt nur für den laufenden Bezug
  if (sz) { ak = 0; wbf = 0; }
  const satz = r4(kv + pv + av + ak + wbf);
  let betrag = r2(b * satz);
  if (fall.pensionist && !sz) {
    if (!j.pensionistMax) return null; // gibt es in diesem Jahr nicht
    betrag = r2(betrag - Math.min(r2(b * 0.1025), j.pensionistMax));
  }
  return { satz, betrag, avSatz: av, gedeckelt: b < basis ? b : null };
}

// Sonderfälle, die einen niedrigeren (oder höheren) Abzug erklären können.
// Die App kennt Alter und Status nicht, deshalb nur als Erklärung, nicht als "passt".
// Bewusst NICHT drin: Schlechtwetterbeitrag (+0,7 %). Gilt laut BSchEG § 1 nicht für Maler/Anstreicher und Bodenleger.
export const SV_FAELLE = [
  { fall: { ab63: true }, text: "Du bist ein Mann ab 63, oder du hast schon Anspruch auf Alterspension (Frauen derzeit ab etwa 61). Dann entfällt die Arbeitslosenversicherung, ab dem Monat nach dem Geburtstag." },
  { fall: { pvHalb: true }, text: "Du hast schon Anspruch auf Alterspension, nimmst sie aber noch nicht (Bonusphase: Männer 65–68, Frauen derzeit etwa 61–64). Dann zahlst du nur die halbe Pensionsversicherung." },
  { fall: { pvHalb: true, ab63: true }, text: "Du hast schon Anspruch auf Alterspension, nimmst sie aber noch nicht (Bonusphase: Männer 65–68, Frauen derzeit etwa 61–64). Dann halbe Pensionsversicherung und keine Arbeitslosenversicherung." },
  { fall: { pensionist: true, ab63: true }, text: "Du bekommst schon eine Alterspension und arbeitest dazu. 2024 und 2025 entfiel dann ein Teil der Pensionsversicherung, außerdem keine Arbeitslosenversicherung." },
  { fall: { lehrling: true }, text: "Du bist Lehrling. Dann gelten eigene, niedrigere Sätze (Krankenversicherung 1,67 %, Arbeitslosenversicherung höchstens 1,15 %, keine AK-Umlage und Wohnbauförderung)." },
  { fall: { wien: true }, text: "Du bist bei einer Firma in Wien angemeldet. Dort ist die Wohnbauförderung ab 2026 höher (18,32 % statt 18,07 %)." },
];

// Prüft einen SV-Beitrag (laufend oder Sonderzahlung) samt Sonderfällen
function pruefeSv(add, titel, basis, ist, jahr, sz) {
  const n = svSoll(basis, jahr, sz);
  let zusatz = "";
  if (n.avSatz < AV_VOLL) zusatz += ` Wegen des geringeren Bezugs fallen nur ${prozent(n.avSatz)} statt ${prozent(AV_VOLL)} Arbeitslosenversicherung an. Das ist richtig so.`;
  if (n.gedeckelt) zusatz += ` Beiträge werden nur bis zur Höchstbeitragsgrundlage von ${euro(n.gedeckelt)} berechnet.`;
  const rechnung = `${prozent(n.satz)} von ${euro(n.gedeckelt ?? basis)} = ${euro(n.betrag)}`;
  if (gleich(n.betrag, ist)) return add("ok", titel, `${rechnung}.${zusatz}`, n.betrag, ist);
  const treffer = SV_FAELLE.filter((f) => {
    if (jahr < 2026 && f.fall.wien) return false; // Wien-Satz erst ab 2026 anders
    const x = svSoll(basis, jahr, sz, f.fall);
    return x && gleich(x.betrag, ist);
  });
  if (treffer.length)
    return add("hinweis", titel, `Normal wären ${rechnung}, abgezogen wurden ${euro(ist)}. Das passt genau zu einem Sonderfall: ${treffer[0].text} Trifft das auf dich zu, ist alles richtig. Wenn nicht, frag beim Lohnbüro nach.`, n.betrag, ist);
  const diff = r2(ist - n.betrag);
  const hinweisAv = n.avSatz < AV_VOLL ? ` Bei diesem Bezug fallen nur ${prozent(n.avSatz)} statt ${prozent(AV_VOLL)} Arbeitslosenversicherung an, das ist schon eingerechnet.` : "";
  add("fehler", titel, `${rechnung}, abgezogen wurden ${euro(ist)}, also ${euro(Math.abs(diff))} ${diff > 0 ? "zu viel" : "zu wenig"}.${hinweisAv}${n.gedeckelt ? zusatz : ""}`, n.betrag, ist);
}
const r4 = (x) => Math.round(x * 1e6) / 1e6; // Sätze wie 5,125 % brauchen mehr als 4 Stellen
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
const prozent = (x) => (x * 100).toLocaleString("de-DE", { maximumFractionDigits: 3 }) + " %";

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
  const hbg = svJahr(jahr).hbg;
  if (!gleich(basisLfd, s.svBasisLfd) && basisLfd > hbg && gleich(s.svBasisLfd, hbg))
    add("ok", "SV-Basis", `Alle Bezüge ohne Reisekosten und Sonderzahlungen: ${euro(basisLfd)}. Gedruckt ist die Höchstbeitragsgrundlage von ${euro(hbg)}, darüber werden keine Beiträge fällig.`, hbg, s.svBasisLfd);
  else add(gleich(basisLfd, s.svBasisLfd) ? "ok" : "fehler", "SV-Basis",
    gleich(basisLfd, s.svBasisLfd)
      ? `Alle Bezüge ohne Reisekosten und Sonderzahlungen: ${euro(basisLfd)}.`
      : `Erwartet ${euro(basisLfd)} (alle Bezüge ohne Reisekosten und Sonderzahlungen), gedruckt ${euro(s.svBasisLfd)}.`,
    basisLfd, s.svBasisLfd);

  // 5) SV laufend
  pruefeSv(add, "Sozialversicherung", s.svBasisLfd, s.svLfd, jahr, false);

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
    pruefeSv(add, "Sonderzahlung: SV", s.svBasisSz, s.svSz, jahr, true);
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
  if (pruefungen.some((x) => x.status === "plus")) return "plus"; // nur Abweichungen zu deinen Gunsten
  return "ok";
}
