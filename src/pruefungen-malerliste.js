// Prüfungen für die Arbeiter-Abrechnungen (Malerliste) und der Abgleich mit dem Monatslohn.
// Regeln abgeleitet aus 33 echten Lohnzetteln (Jän 2024 – Sep 2026).
import { auftraegeAusAbrechnungen, betragFuerAuftrag } from "./malerliste.js";
import { euro } from "./pruefungen.js";
import { gleicheArbeitAndererPreis } from "./preise.js";

// Tagespauschale je Maler und Stunde. Unabhängig vom Regiesatz (z. B. 18,10 €).
// Gilt ab Juli 2026 ("laut Besprechung"). Ältere Zettel hatten andere Sätze (Feb 2024: 18,50 €).
// Ändert sich der Satz, hier einen neuen Eintrag ergänzen.
const TAGESPAUSCHALE = [{ ab: "2026-07", satz: 21.0 }];
const tpSollSatz = (monat) => (monat ? TAGESPAUSCHALE.filter((t) => monat >= t.ab).at(-1)?.satz ?? null : null);

// Typischer Regie-Text: "21.06. > ...", "inkl. FZ", "Fahrzeit", "Abdecken", "Ausbesserung"
const REGIE_TEXT = /^\d{1,2}\.(\d{1,2}\.)?.*>|inkl\.?\s*FZ|Fahrzeit|Regie|^Abdeck|Ausbesserung/i;

export const auftragStatus = (auf) =>
  auf.pruefungen.some((x) => x.status === "fehler") ? "fehler" : auf.pruefungen.some((x) => x.status === "hinweis") ? "hinweis" : "ok";

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const gleich = (a, b, tol = 0.011) => a != null && b != null && Math.abs(a - b) <= tol;
const menge = (x) => x.toLocaleString("de-DE", { maximumFractionDigits: 2 });
const datum = (iso) => (iso ? iso.split("-").reverse().join(".") : "?");
// Team-Name ohne den eigenen Namen: "mit Erika Beispiel"
const mitWem = (a, ich) => a.name.split("+").map((s) => s.trim()).filter((n) => n && n !== ich).join(", ");

// Häufigster Stundensatz der Regie-Positionen = Regie-Basissatz des Monats
function regiesatz(abrechnungen) {
  const zaehl = new Map();
  for (const a of abrechnungen)
    for (const p of a.positionen)
      if (p.einheit === "Std" && !p.tagespauschale && p.satz > 0 && !p.p50 && !p.p10) zaehl.set(p.satz, (zaehl.get(p.satz) ?? 0) + 1);
  return [...zaehl.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
}

function pruefeAbrechnung(a, alle, basis, ich) {
  const p = [];
  const add = (status, titel, text) => p.push({ status, titel, text });

  for (const pos of a.positionen) {
    if (pos.anteilAus) continue;
    if (pos.menge == null || pos.satz == null || pos.gesamt == null) {
      add("hinweis", "Zeile nicht ganz lesbar", `„${pos.name}“: Menge, Satz oder Betrag fehlt. Bitte selbst ansehen.`);
      continue;
    }
    const faktor = pos.menge + 0.5 * (pos.p50 ?? 0) + 0.1 * (pos.p10 ?? 0);
    const soll = r2(pos.satz * faktor);
    if (!gleich(soll, pos.gesamt))
      add("fehler", `${pos.name}: falsch gerechnet`, `${menge(pos.menge)} ${pos.einheit} × ${euro(pos.satz)}${pos.p10 || pos.p50 ? " inkl. Zuschlag" : ""} ergibt ${euro(soll)}, abgerechnet sind ${euro(pos.gesamt)}.`);
    if (pos.p10 || pos.p50)
      add("info", `Zuschlag: ${pos.name}`, `${pos.p50 ? `50 % auf ${menge(pos.p50)} ${pos.einheit}` : ""}${pos.p50 && pos.p10 ? ", " : ""}${pos.p10 ? `10 % auf ${menge(pos.p10)} ${pos.einheit}` : ""} → ${euro(pos.gesamt)}.`);
    if (pos.gesamt < 0)
      add("info", `Abzug: ${pos.name}`, `${euro(pos.gesamt)} werden in diesem Auftrag abgezogen.`);
    const tpSoll = pos.tagespauschale ? tpSollSatz(a.monat) : null;
    if (tpSoll && !gleich(pos.satz, tpSoll, 0.005))
      add("fehler", `${pos.name}: falscher Satz`, `Die Tagespauschale beträgt ${euro(tpSoll)}/Std, abgerechnet sind ${euro(pos.satz)}/Std. Richtig wären ${menge(pos.menge)} Std × ${euro(tpSoll)} = ${euro(r2(pos.menge * tpSoll))} statt ${euro(pos.gesamt)}, also ${euro(Math.abs(r2(pos.menge * tpSoll - pos.gesamt)))} ${pos.menge * tpSoll >= pos.gesamt ? "zu wenig" : "zu viel"}.`);
    if (pos.einheit && pos.einheit !== "Std" && !pos.tagespauschale && REGIE_TEXT.test(pos.name))
      add("hinweis", `${pos.name}: sieht nach Regie aus`, `Der Text klingt nach Stundenarbeit, abgerechnet ist aber ${menge(pos.menge)} ${pos.einheit} × ${euro(pos.satz)} = ${euro(pos.gesamt)}.${basis ? ` Als Regie wären ${menge(pos.menge)} Std × ${euro(basis)} = ${euro(r2(pos.menge * basis))}.` : ""} Bitte prüfen.`);
    if (basis && pos.einheit === "Std" && !pos.tagespauschale && pos.satz > 0 && pos.satz < basis - 0.005)
      add("hinweis", `${pos.name}: niedriger Stundensatz`, `${euro(pos.satz)}/Std, der Regiesatz in diesem Monat ist ${euro(basis)}/Std. Im Monat der jährlichen Erhöhung ist das für Arbeit davor normal. Sonst wurde die Erhöhung vielleicht vergessen.`);
  }

  const summePos = r2(a.positionen.reduce((s, x) => s + (x.gesamt ?? 0), 0));
  if (a.summe == null) add("hinweis", "Summe nicht gefunden", "Die Auftragssumme konnte ich nicht lesen.");
  else if (!gleich(summePos, a.summe, Math.max(0.011, a.positionen.length * 0.005)))
    add("fehler", "Auftragssumme", `Die Positionen ergeben ${euro(summePos)}, als Summe steht ${euro(a.summe)} da.`);

  if (a.team && a.summe != null) {
    const tp = r2(a.positionen.filter((x) => x.tagespauschale).reduce((s, x) => s + x.gesamt, 0));
    const soll = r2((a.summe - tp) / a.anzahlArbeiter + tp);
    if (a.anteil == null) add("hinweis", "Anteil nicht gefunden", "Den Anteil pro Arbeiter konnte ich nicht lesen.");
    else if (tp && gleich(a.anteil, r2(a.summe / a.anzahlArbeiter)) && !gleich(a.anteil, soll))
      add("fehler", "Tagespauschale wurde geteilt",
        `Die Tagespauschale (${euro(tp)}) steht jedem Maler voll zu, wurde aber durch ${a.anzahlArbeiter} geteilt. Richtig wären ${euro(soll)} statt ${euro(a.anteil)}, also ${euro(r2(soll - a.anteil))} zu wenig.`);
    else if (!gleich(a.anteil, soll))
      add("fehler", "Anteil", `${euro(a.summe)}${tp ? ` (davon Tagespauschale ${euro(tp)} ungeteilt)` : ""} ÷ ${a.anzahlArbeiter} ergibt ${euro(soll)}, abgerechnet sind ${euro(a.anteil)}.`);
    else if (!p.some((x) => x.status === "fehler"))
      add("ok", "Anteil", `${euro(a.summe)}${tp ? ` (Tagespauschale ${euro(tp)} ungeteilt)` : ""} ÷ ${a.anzahlArbeiter} = ${euro(a.anteil)}.`);
  }

  for (const pos of a.positionen.filter((x) => x.anteilAus)) {
    const t = alle.find((x) => x.team && x.auftrag === a.auftrag && x.schluessel === pos.anteilAus);
    if (t && !gleich(t.anteil, pos.gesamt))
      add("fehler", "Anteil aus Team-Abrechnung", `Übernommen wurden ${euro(pos.gesamt)}, auf der Team-Abrechnung stehen ${euro(t.anteil)}.`);
  }

  if (a.versionen.length > 1)
    add("info", `${a.versionen.length} Versionen`, `Diese Abrechnung liegt mehrfach vor (${a.versionen.map((v) => `${datum(v.vom)}: ${euro(a.team ? v.anteil : v.summe)}`).join(", ")}). Gezählt wird die neueste.`);
  return p;
}

export function pruefeMalerliste(abrechnungen, gehalt) {
  const auftraege = auftraegeAusAbrechnungen(abrechnungen);
  const basis = regiesatz(abrechnungen);
  const ich = abrechnungen.find((a) => !a.team)?.name ?? "";
  const tpSatz = abrechnungen.flatMap((a) => a.positionen).find((x) => x.tagespauschale)?.satz ?? null;

  for (const auf of auftraege) {
    auf.pruefungen = auf.abrechnungen.flatMap((a) =>
      pruefeAbrechnung(a, abrechnungen, basis, ich).map((x) => ({ ...x, titel: a.team ? `${x.titel} (Team mit ${mitWem(a, ich) || "Kollegen"})` : x.titel })));
    if (!auf.eigene.length && auf.teams.length > 1)
      auf.pruefungen.push({ status: "hinweis", titel: "Mehrere Team-Abrechnungen", text: `Dieser Auftrag hat ${auf.teams.length} Team-Abrechnungen (${auf.teams.map((t) => `mit ${mitWem(t, ich)}: ${euro(t.anteil)}`).join(", ")}), aber keine eigene Abrechnung, die sie zusammenfasst. Prüfe, ob alle ausbezahlt wurden.` });
    for (const t of auf.eigene.length ? auf.teams : []) {
      const erfasst = auf.eigene.some((e) => e.positionen.some((x) => x.anteilAus === t.schluessel || (/Anteil/i.test(x.name) && x.gesamt < 0)));
      if (!erfasst)
        auf.pruefungen.push({ status: "hinweis", titel: "Team-Anteil fehlt auf deiner Abrechnung", text: `Der Team-Anteil mit ${mitWem(t, ich)} (${euro(t.anteil)}) steht nicht auf deiner eigenen Abrechnung für diesen Auftrag.` });
    }
    auf.art = auf.eigene.length ? (auf.teams.length ? "eigen + Team" : "eigen") : `Team mit ${auf.teams.map((t) => mitWem(t, ich)).join(" / ")}`;
    auf.gewerk = auf.abrechnungen[0].gewerk;
  }
  gleicheArbeitAndererPreis(auftraege);
  for (const auf of auftraege) auf.status = auftragStatus(auf);

  // Abgleich: Summe aller Aufträge = Monatslohn (Pos. 135)?
  const abgleich = [];
  const lohn = r2(gehalt.bezuege.filter((b) => b.code === "135").reduce((s, b) => s + b.betrag, 0));
  const summe = r2(auftraege.reduce((s, a) => s + a.betrag, 0));
  const diff = r2(summe - lohn); // > 0: weniger ausbezahlt als abgerechnet
  const add = (status, titel, text) => abgleich.push({ status, titel, text });

  if (!auftraege.length) {
    add("info", "Malerliste", "In dieser PDF sind keine Arbeiter-Abrechnungen enthalten.");
  } else if (Math.abs(diff) <= 0.05) {
    add("ok", "Aufträge = Monatslohn", `Alle ${auftraege.length} Aufträge ergeben ${euro(summe)}, als Monatslohn wurden ${euro(lohn)} abgerechnet.${diff ? " (Rundungsdifferenz)" : ""}`);
  } else {
    // 1) Passt es mit einer anderen Version einer mehrfach vorhandenen Abrechnung?
    let erklaert = null;
    for (const auf of auftraege) {
      for (const a of auf.abrechnungen.filter((x) => x.versionen.length > 1)) {
        for (const v of a.versionen.filter((x) => x !== a)) {
          const neu = r2(summe - auf.betrag + betragFuerAuftrag(auf.abrechnungen, new Map([[a, v]])));
          if (Math.abs(neu - lohn) <= 0.05) erklaert ??= { auf, v };
        }
      }
    }
    if (erklaert) {
      add("ok", "Aufträge = Monatslohn", `Passt, wenn bei Auftrag ${erklaert.auf.auftrag} die Version vom ${datum(erklaert.v.vom)} zählt. Ausbezahlt wurden ${euro(lohn)}.`);
    } else {
      // 2) Entspricht die Differenz genau einem Auftrag oder Team-Anteil?
      const kandidaten = auftraege.flatMap((auf) => [
        ...auf.teams.map((t) => ({ betrag: t.anteil, text: `dem Team-Anteil aus Auftrag ${auf.auftrag} (mit ${mitWem(t, ich)}, ${euro(t.anteil)})` })),
        ...auf.eigene.map((e) => ({ betrag: e.summe, text: `deiner Abrechnung für Auftrag ${auf.auftrag} (${euro(e.summe)})` })),
      ]);
      const treffer = kandidaten.filter((k) => Math.abs(Math.abs(diff) - k.betrag) <= 0.02);
      const erklaerung = treffer.length === 1
        ? ` Das entspricht genau ${treffer[0].text}.${diff > 0 ? " Der wurde vermutlich nicht ausbezahlt." : ""}`
        : treffer.length > 1
          ? ` Der Betrag passt zu mehreren Aufträgen: ${treffer.slice(0, 3).map((k) => k.text).join(" oder ")}.`
          : "";
      if (diff > 0)
        add("fehler", "Weniger ausbezahlt als abgerechnet",
          `Die Aufträge ergeben ${euro(summe)}, als Monatslohn wurden nur ${euro(lohn)} abgerechnet: ${euro(diff)} weniger.` + (erklaerung || " Frag im Lohnbüro nach."));
      else
        add("hinweis", "Mehr ausbezahlt als abgerechnet",
          `Als Monatslohn wurden ${euro(lohn)} abgerechnet, die Aufträge in der PDF ergeben nur ${euro(summe)} (${euro(-diff)} mehr).` + (erklaerung || " Vielleicht fehlt eine Abrechnungsseite in der PDF."));
    }
  }
  return { auftraege, abgleich, regiesatz: basis, tagespauschaleSatz: tpSatz, summe, lohn };
}
