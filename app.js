import * as pdfjs from "./vendor/pdfjs/pdf.min.mjs";
import { zeilenAusItems } from "./src/parser.js";
import { euro } from "./src/pruefungen.js";
import { werteAus, pruefePreisverlauf, pruefePreisliste } from "./src/auswertung.js";
import { istPreisliste, lesePreisliste } from "./src/preisliste.js";

pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.min.mjs";

const $ = (id) => document.getElementById(id);
const dateienInput = $("dateien"), pwForm = $("pwForm"), pwInput = $("passwort");
const meldung = $("meldung"), ergebnis = $("ergebnis"), pruefenKnopf = $("pruefen");

const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const monatName = (m) => (m ? `${MONATE[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}` : "Unbekannter Monat");
const SYMBOL = { ok: "✓", hinweis: "!", fehler: "✕", info: "i" };
const STATUSWORT = { ok: "passt", hinweis: "Hinweis", fehler: "Abweichung", info: "Info" };
const CHIP = { ok: "Alles passt", hinweis: "Hinweis", fehler: "Abweichung" };
const wichtig = (x) => x.status === "fehler" || x.status === "hinweis";

let dateien = [];

// Preisverlauf (nur Arbeit + €-Satz je Monat) bleibt nur in diesem Browser
const SPEICHER = "lohnzettel-checker.preisverlauf";
function ladeVerlauf() {
  try { return JSON.parse(localStorage.getItem(SPEICHER)) ?? {}; } catch { return {}; }
}
const LISTE = "lohnzettel-checker.preisliste";
function ladeListe() {
  try { return JSON.parse(localStorage.getItem(LISTE)); } catch { return null; }
}
// "MAL Maler- und Anstreicharbeiten" -> "Maler- und Anstreicharbeiten" (Kürzel vorne weglassen)
const gruppenName = (g) => (g ? g.replace(/^[A-ZÄÖÜ]{2,6}\s+(?=\S)/, "") : "Lohnpreisliste");
function zeigeListe() {
  const l = ladeListe();
  const info = $("preislisteInfo");
  info.replaceChildren();
  info.classList.toggle("geladen", !!l);
  if (l) {
    const haken = el("span", "haken", "✓");
    haken.setAttribute("aria-hidden", "true");
    const text = el("span");
    text.append(el("strong", null, "Preisliste geladen"), el("br"), `${gruppenName(l.gruppe)} · Stand ${l.stand ?? "?"} · ${l.anzahl} Artikel`);
    info.append(haken, text);
  } else info.textContent = "Keine Preisliste geladen. Es wird nur nachgerechnet, nicht mit Listenpreisen verglichen.";
  $("preislisteKarte").classList.toggle("geladen", !!l);
  $("preislisteWeg").hidden = !l;
}
zeigeListe();

$("preislisteDatei").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const doc = await oeffne(new Uint8Array(await f.arrayBuffer()), "");
    if (doc.passwortFalsch) { $("preislisteInfo").textContent = "Diese Preisliste ist passwortgeschützt. Das wird noch nicht unterstützt."; return; }
    const seiten = [];
    for (let n = 1; n <= doc.numPages; n++) seiten.push(zeilenAusItems((await (await doc.getPage(n)).getTextContent()).items));
    await doc.destroy();
    const l = lesePreisliste(seiten);
    if (!istPreisliste(seiten) || !l.anzahl) { $("preislisteInfo").textContent = `In „${f.name}“ habe ich keine Preisliste gefunden (ArtNr, Einheit, Preis).`; return; }
    try { localStorage.setItem(LISTE, JSON.stringify(l)); } catch { /* privater Modus */ }
    zeigeListe();
    if (!ladeListe()) $("preislisteInfo").textContent = `Preisliste gelesen (${l.anzahl} Artikel), aber dieser Browser kann sie nicht speichern (privater Modus?).`;
  } catch (err) {
    console.error(err);
    $("preislisteInfo").textContent = "Die Preisliste konnte nicht gelesen werden.";
  }
});

$("preislisteWeg").addEventListener("click", () => {
  try { localStorage.removeItem(LISTE); } catch { /* egal */ }
  zeigeListe();
});

function speichereVerlauf(v) {
  try { localStorage.setItem(SPEICHER, JSON.stringify(v)); } catch { /* privater Modus: dann eben ohne */ }
}

function zeigeMeldung(text, fehler = false) {
  meldung.textContent = text;
  meldung.classList.toggle("fehler", fehler);
}

function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text != null) e.textContent = text;
  return e;
}

dateienInput.addEventListener("change", () => {
  dateien = [...dateienInput.files];
  if (!dateien.length) return;
  $("dateiinfo").textContent = dateien.length === 1 ? dateien[0].name : `${dateien.length} Dateien ausgewählt`;
  ergebnis.replaceChildren();
  zeigeMeldung("");
  pwForm.hidden = false;
  pwInput.focus();
});

$("pwZeigen").addEventListener("click", () => {
  pwInput.type = pwInput.type === "password" ? "text" : "password";
});

pwForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await pruefeDateien(dateien.map((f) => ({ name: f.name, laden: () => f.arrayBuffer() })), pwInput.value);
});

$("beispiel").addEventListener("click", async () => {
  zeigeMeldung("Muster-Zettel wird geladen … (Passwort: muster)");
  await pruefeDateien([{ name: "muster-lohnzettel.pdf", laden: () => fetch("beispiel/muster-lohnzettel.pdf").then((r) => r.arrayBuffer()) }], "muster", false);
});

async function oeffne(daten, passwort) {
  try {
    return await pdfjs.getDocument({ data: daten, password: passwort, isEvalSupported: false, verbosity: 0 }).promise;
  } catch (err) {
    if (err?.name === "PasswordException") return { passwortFalsch: true };
    throw err;
  }
}

async function pruefeDateien(liste, passwort, merken = true) {
  pruefenKnopf.disabled = true;
  ergebnis.replaceChildren();
  const monate = [], ohneGehaltsseite = [], gesehen = new Set();
  try {
    for (const datei of liste) {
      zeigeMeldung(`Lese ${datei.name} …`);
      const doc = await oeffne(new Uint8Array(await datei.laden()), passwort);
      if (doc.passwortFalsch) {
        zeigeMeldung(passwort ? `Das Passwort passt nicht zu „${datei.name}“.` : "Diese Datei ist geschützt. Bitte gib dein Passwort ein.", true);
        pwInput.select();
        return;
      }
      const seiten = [];
      for (let n = 1; n <= doc.numPages; n++) {
        zeigeMeldung(`Lese ${datei.name} … Seite ${n} von ${doc.numPages}`);
        seiten.push(zeilenAusItems((await (await doc.getPage(n)).getTextContent()).items));
      }
      await doc.destroy();
      const m = werteAus(seiten);
      if (!m) { ohneGehaltsseite.push(datei.name); continue; }
      const key = `${m.monat}|${m.netto}`;
      if (gesehen.has(key)) continue; // gleicher Monat zweimal ausgewählt
      gesehen.add(key);
      monate.push(m);
    }
    pwInput.value = ""; // Passwort sofort vergessen
    zeigeMeldung("");
    monate.sort((a, b) => (a.monat ?? "").localeCompare(b.monat ?? ""));
    // Muster-Zettel nicht mit den eigenen Preisen vermischen
    const verlauf = pruefePreisverlauf(monate, merken ? ladeVerlauf() : {});
    if (merken) speichereVerlauf(verlauf);
    const preisliste = merken ? ladeListe() : null;
    const vergleich = preisliste ? { ...pruefePreisliste(monate, preisliste), stand: preisliste.stand } : null;
    zeigeErgebnis(monate, ohneGehaltsseite, merken ? Object.keys(verlauf).length : 0, vergleich);
  } catch (err) {
    console.error(err);
    zeigeMeldung("Die Datei konnte nicht gelesen werden. Ist es wirklich ein Lohnzettel als PDF?", true);
  } finally {
    pruefenKnopf.disabled = false;
  }
}

function zeigeErgebnis(monate, ohneGehaltsseite, verlaufMonate, vergleich) {
  const zaehl = { ok: 0, hinweis: 0, fehler: 0 };
  monate.forEach((m) => zaehl[m.status]++);

  const kopf = el("section", "karte zusammenfassung");
  const bits = monate.length ? [`${monate.length} ${monate.length === 1 ? "Monat" : "Monate"} geprüft`] : ["Keine Gehaltsseite gefunden."];
  if (zaehl.ok) bits.push(`${zaehl.ok} ✓ passt`);
  if (zaehl.hinweis) bits.push(`${zaehl.hinweis} mit Hinweis`);
  if (zaehl.fehler) bits.push(`${zaehl.fehler} mit Abweichung`);
  const neu = el("button", "knopf", "Neu starten");
  neu.addEventListener("click", neuStart);
  kopf.append(el("p", null, bits.join(" · ")), neu);
  if (ohneGehaltsseite.length) kopf.append(el("p", "klein", `Ohne Gehaltsseite (übersprungen): ${ohneGehaltsseite.join(", ")}`));
  if (vergleich)
    kopf.append(el("p", "klein", `Preisliste (Stand ${vergleich.stand ?? "?"}): ${vergleich.verglichen} Positionen verglichen${vergleich.ohne ? `, ${vergleich.ohne} ohne passende Listenposition (Sonderpreise, Nachverrechnungen)` : ""}.`));
  if (verlaufMonate) {
    const vz = el("p", "klein", `Akkordpreise verglichen mit ${verlaufMonate} ${verlaufMonate === 1 ? "Monat" : "Monaten"}, nur in diesem Browser gespeichert. `);
    const weg = el("button", "linkknopf", "Preisverlauf löschen");
    weg.type = "button";
    weg.addEventListener("click", () => {
      try { localStorage.removeItem(SPEICHER); } catch { /* egal */ }
      vz.textContent = "Preisverlauf gelöscht.";
    });
    vz.append(weg);
    kopf.append(vz);
  }

  ergebnis.replaceChildren(kopf, ...monate.map(monatsKarte));
  kopf.scrollIntoView({ behavior: "smooth", block: "start" });
}

function pruefPunkt(x, wo = "") {
  const li = el("li", x.status);
  const sym = el("span", "symbol", SYMBOL[x.status]);
  sym.setAttribute("aria-label", STATUSWORT[x.status]);
  const inhalt = el("div");
  inhalt.append(el("span", "titel", wo + x.titel), el("span", "text", x.text));
  li.append(sym, inhalt);
  return li;
}

// Passende Prüfungen eingeklappt, Infos offen
function fuelleListe(ul, pruefungen) {
  const oks = pruefungen.filter((x) => x.status === "ok");
  if (oks.length) {
    const li = el("li", "okzeile");
    const det = el("details");
    const ul2 = el("ul");
    oks.forEach((x) => ul2.append(pruefPunkt(x)));
    det.append(el("summary", null, `✓ ${oks.length} ${oks.length === 1 ? "Prüfung passt" : "Prüfungen passen"}`), ul2);
    li.append(det);
    ul.append(li);
  }
  pruefungen.filter((x) => x.status === "info").forEach((x) => ul.append(pruefPunkt(x)));
}

function tabellenZeile(zellen, zahlAb = 1) {
  const tr = el("tr");
  zellen.forEach((t, i) => {
    const td = el("td", i >= zahlAb ? "zahl" : null);
    if (t instanceof Node) td.append(t);
    else td.textContent = t;
    tr.append(td);
  });
  return tr;
}

function monatsKarte(m) {
  const k = $("tplMonat").content.firstElementChild.cloneNode(true);
  const q = (s) => k.querySelector(s);
  q(".monatname").textContent = monatName(m.monat);
  q(".chip").textContent = CHIP[m.status];
  q(".chip").classList.add(m.status);
  q(".brutto").textContent = euro(m.summeBezuege);
  q(".abzuege").textContent = euro(m.summen ? m.summen.abzuege : null);
  q(".netto").textContent = euro(m.netto);

  // Alles Auffällige ganz oben
  const top = q(".wichtig");
  m.pruefungen.filter(wichtig).forEach((x) => top.append(pruefPunkt(x)));
  m.maler.abgleich.filter(wichtig).forEach((x) => top.append(pruefPunkt(x)));
  for (const a of m.maler.auftraege) a.pruefungen.filter(wichtig).forEach((x) => top.append(pruefPunkt(x, `Auftrag ${a.auftrag}: `)));
  if (!top.children.length) top.remove();

  // Gehaltsseite
  fuelleListe(q(".gehalt"), m.pruefungen);
  const bz = q(".bezugszeilen");
  for (const b of m.bezuege)
    bz.append(tabellenZeile([`${b.code} ${b.name}`, b.menge != null ? b.menge.toLocaleString("de-DE", { minimumFractionDigits: 2 }) : "", b.satz != null ? euro(b.satz) : "", euro(b.betrag)]));

  // Malerliste
  const ml = m.maler;
  const saetze = [];
  if (ml.regiesatz) saetze.push(`Regiesatz in diesem Monat: ${euro(ml.regiesatz)}/Std`);
  if (ml.tagespauschaleSatz) saetze.push(`Tagespauschale: ${euro(ml.tagespauschaleSatz)}/Std`);
  q(".saetze").textContent = saetze.join(" · ");
  if (!saetze.length) q(".saetze").remove();
  fuelleListe(q(".maler"), [
    ...ml.abgleich.filter((x) => !wichtig(x)),
    ...ml.auftraege.flatMap((a) => a.pruefungen.filter((x) => !wichtig(x)).map((x) => ({ ...x, titel: `Auftrag ${a.auftrag}: ${x.titel}` }))),
  ]);
  const az = q(".auftragszeilen");
  for (const a of ml.auftraege) {
    const sym = el("span", `mini ${a.status}`, SYMBOL[a.status]);
    sym.setAttribute("aria-label", STATUSWORT[a.status]);
    az.append(tabellenZeile([sym, a.auftrag, a.art, euro(a.betrag)], 3));
  }
  q(".auftragssumme").textContent = euro(ml.summe);
  if (!ml.auftraege.length) q(".auftragszeilen").closest("details").remove();
  return k;
}

function neuStart() {
  dateien = [];
  dateienInput.value = "";
  pwInput.value = "";
  pwForm.hidden = true;
  $("dateiinfo").textContent = "Du kannst auch mehrere Monate auf einmal wählen.";
  ergebnis.replaceChildren();
  zeigeMeldung("");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
