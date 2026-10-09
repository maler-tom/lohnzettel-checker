import * as pdfjs from "./vendor/pdfjs/pdf.min.mjs";
import { zeilenAusItems } from "./src/parser.js?v=0.21";
import { euro } from "./src/pruefungen.js?v=0.21";
import { werteAus, pruefePreisverlauf, pruefePreisliste } from "./src/auswertung.js?v=0.21";
import { istPreisliste, lesePreisliste } from "./src/preisliste.js?v=0.21";
import { menge, vorzeichenEuro } from "./src/abgleich.js?v=0.21";
import { protokollAusMonat, leseExport, exportDaten, ladeProtokolle, ladeProtokoll, speichereProtokoll, loescheProtokoll, loescheAlleProtokolle } from "./src/protokoll.js?v=0.21";

pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.min.mjs";

const $ = (id) => document.getElementById(id);
const dateienInput = $("dateien"), pwForm = $("pwForm"), pwInput = $("passwort");
const meldung = $("meldung"), ergebnis = $("ergebnis"), pruefenKnopf = $("pruefen");

const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const monatName = (m) => (m ? `${MONATE[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}` : "Unbekannter Monat");
// Farben nach Wirkung für dich: rot = zu deinem Nachteil, blau = zu deinen Gunsten, orange = unklar/selbst ansehen
const SYMBOL = { ok: "✓", hinweis: "!", fehler: "✕", plus: "+", info: "i" };
const STATUSWORT = { ok: "passt", hinweis: "Hinweis", fehler: "zu deinem Nachteil", plus: "zu deinen Gunsten", info: "Info" };
const CHIP = { ok: "Alles passt", hinweis: "Hinweis", fehler: "Abweichung", plus: "Zu deinen Gunsten" };
const wichtig = (x) => x.status === "fehler" || x.status === "hinweis" || x.status === "plus";

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
      m.muster = !merken; // Muster-Zettel nie ins Protokoll
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
  const zaehl = { ok: 0, hinweis: 0, fehler: 0, plus: 0 };
  monate.forEach((m) => zaehl[m.status]++);

  const kopf = el("section", "karte zusammenfassung");
  const bits = monate.length ? [`${monate.length} ${monate.length === 1 ? "Monat" : "Monate"} geprüft`] : ["Keine Gehaltsseite gefunden."];
  if (zaehl.ok) bits.push(`${zaehl.ok} ✓ passt`);
  if (zaehl.hinweis) bits.push(`${zaehl.hinweis} mit Hinweis`);
  if (zaehl.plus) bits.push(`${zaehl.plus} zu deinen Gunsten`);
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

// Passende Prüfungen und Infos eingeklappt
function klappZeile(ul, punkte, klasse, titel) {
  if (!punkte.length) return;
  const li = el("li", `okzeile ${klasse}`);
  const det = el("details");
  const ul2 = el("ul");
  punkte.forEach((x) => ul2.append(pruefPunkt(x)));
  det.append(el("summary", null, titel), ul2);
  li.append(det);
  ul.append(li);
}

function fuelleListe(ul, pruefungen) {
  const oks = pruefungen.filter((x) => x.status === "ok"), infos = pruefungen.filter((x) => x.status === "info");
  klappZeile(ul, oks, "", `✓ ${oks.length} ${oks.length === 1 ? "Prüfung passt" : "Prüfungen passen"}`);
  klappZeile(ul, infos, "infozeile", `ⓘ ${infos.length} ${infos.length === 1 ? "Info" : "Infos"}`);
}

const LOHNBUERO = "barbara.fehringer@wolitz.at";

// Öffnet das eigene Mail-Programm mit fertigem Text. Gesendet wird erst dort, nach eigener Kontrolle.
function mailAnsLohnbuero(monat, punkte) {
  // Tipps, die nur für dich sind, nicht ans Lohnbüro
  const fuerMail = (t) => t.replace(" Überscheren und abkehren gehört fix zur Arbeit und steht dir zu.", "");
  const block = (liste) => liste.map((x) => `- ${x.titel}\n  ${fuerMail(x.text)}`).join("\n\n");
  const fehler = punkte.filter((x) => x.status === "fehler"), hinweise = punkte.filter((x) => x.status === "hinweis");
  const einer = punkte.length === 1;
  const teile = [
    "Hallo Barbara,",
    `ich habe meinen Lohnzettel für ${monatName(monat)} nachgerechnet und bin dabei auf ${einer ? "einen Punkt gestoßen, den" : "ein paar Punkte gestoßen, die"} ich mir nicht ganz erklären kann. Vielleicht übersehe ich auch etwas. Könntest du ${einer ? "ihn" : "sie"} dir bitte einmal anschauen?`,
  ];
  if (fehler.length) teile.push(`Was mir aufgefallen ist:\n\n${block(fehler)}`);
  if (hinweise.length) teile.push(`${fehler.length ? "Bitte auch kurz ansehen" : "Was mir aufgefallen ist"}:\n\n${block(hinweise)}`);
  teile.push("Falls alles seine Richtigkeit hat, reicht mir eine kurze Info, dann weiß ich Bescheid.");
  teile.push("Danke dir schon im Voraus und liebe Grüße");
  const betreff = `Lohnzettel ${monatName(monat)} – kurze Bitte um Kontrolle`;
  return `mailto:${LOHNBUERO}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(teile.join("\n\n"))}`;
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
  zeigeBruttoCheck(q(".bruttocheck"), m.brutto);

  // Alles Auffällige ganz oben
  const top = q(".wichtig");
  const auffaellig = [
    ...m.pruefungen.filter(wichtig),
    ...m.maler.abgleich.filter(wichtig),
    ...m.maler.auftraege.flatMap((a) => a.pruefungen.filter(wichtig).map((x) => ({ ...x, titel: `Auftrag ${a.auftrag}: ${x.titel}` }))),
  ];
  // Zwei Aufklapp-Knöpfe: "Abweichungen" (rot = Nachteil, dann orange = unklar, mit Mail-Knopf)
  // und "Zu deinen Gunsten" (blau, ohne Mail)
  const nachteil = auffaellig.filter((x) => x.status === "fehler"), unklar = auffaellig.filter((x) => x.status === "hinweis");
  const gunsten = auffaellig.filter((x) => x.status === "plus");
  // Mail-Knopf nur, wenn etwas zu deinem Nachteil (rot) oder falsch gebucht ist (andere Einheit als eingereicht).
  // Nur diese Punkte kommen in die Mail. Mit "×" rechts nimmst du einen Punkt aus der Mail heraus.
  // Umbuchung mit weniger € (anderer Preis) auch, die Menge stimmt dann zwar, das Geld aber nicht.
  const melden = [...nachteil, ...unklar.filter((x) => x.art === "umgerechnet" || (x.art === "umgebucht" && (x.euro ?? 0) < -0.02))];
  const weggelassen = new Set();
  const mailKnopf = q(".mailknopf"), mailInfo = el("p", "klein mailweg");
  const mailNeu = () => {
    const rein = melden.filter((x) => !weggelassen.has(x));
    mailKnopf.hidden = !rein.length;
    if (rein.length) mailKnopf.href = mailAnsLohnbuero(m.monat, rein);
    mailInfo.textContent = !weggelassen.size ? "" : rein.length
      ? `${weggelassen.size} ${weggelassen.size === 1 ? "Punkt wird" : "Punkte werden"} nicht mitgeschickt.`
      : "Alle Punkte weggelassen, es gibt nichts zu schicken.";
  };
  for (const x of [...nachteil, ...unklar]) {
    const li = mitSprung(pruefPunkt(x), x, k);
    if (melden.includes(x)) {
      li.classList.add("mitweg");
      const weg = el("button", "wegknopf", "×");
      weg.type = "button";
      weg.title = weg.ariaLabel = "Nicht ans Lohnbüro schicken";
      weg.addEventListener("click", (e) => {
        e.stopPropagation(); // nicht zum Auftrag springen
        const raus = !weggelassen.has(x);
        if (raus) weggelassen.add(x); else weggelassen.delete(x);
        li.classList.toggle("weggelassen", raus);
        weg.textContent = raus ? "↩" : "×";
        weg.title = weg.ariaLabel = raus ? "Wieder mitschicken" : "Nicht ans Lohnbüro schicken";
        mailNeu();
      });
      li.append(weg);
    }
    top.append(li);
  }
  if (melden.length) { q(".mailbereich").prepend(mailInfo); mailNeu(); }
  else q(".mailbereich").remove();
  if (nachteil.length || unklar.length) klappKopf(q(".abweichungsklapp"), statusAus([...nachteil, ...unklar]), zaehlText([...nachteil, ...unklar]));
  else q(".abweichungsklapp").remove();
  gunsten.forEach((x) => q(".pluspunkte").append(mitSprung(pruefPunkt(x), x, k)));
  const plusEuro = Math.round(gunsten.reduce((s, x) => s + (x.euro ?? 0), 0) * 100) / 100;
  if (gunsten.length) klappKopf(q(".plusklapp"), "plus", `${gunsten.length} ${gunsten.length === 1 ? "Punkt" : "Punkte"}${plusEuro ? ` · ${vorzeichenEuro(plusEuro)}` : ""}`);
  else q(".plusklapp").remove();

  // Gehaltsseite
  fuelleListe(q(".gehalt"), m.pruefungen.filter((x) => !x.bereich));
  const bz = q(".bezugszeilen");
  for (const b of m.bezuege)
    bz.append(tabellenZeile([`${b.code} ${b.name}`, b.menge != null ? b.menge.toLocaleString("de-DE", { minimumFractionDigits: 2 }) : "", b.satz != null ? euro(b.satz) : "", euro(b.betrag)]));

  // Arbeiter-Abrechnung (Aufträge)
  const ml = m.maler;
  const saetze = [];
  if (ml.regiesatz) saetze.push(`Regiesatz in diesem Monat: ${euro(ml.regiesatz)}/Std`);
  if (ml.tagespauschaleSatz) saetze.push(`Tagespauschale: ${euro(ml.tagespauschaleSatz)}/Std`);
  q(".saetze").textContent = saetze.join(" · ");
  if (!saetze.length) q(".saetze").remove();
  fuelleListe(q(".maler"), [
    ...ml.abgleich.filter((x) => !wichtig(x) && !x.bereich),
    ...ml.auftraege.flatMap((a) => a.pruefungen.filter((x) => !wichtig(x) && !x.bereich).map((x) => ({ ...x, titel: `Auftrag ${a.auftrag}: ${x.titel}` }))),
  ]);
  const az = q(".auftragszeilen");
  for (const a of ml.auftraege) {
    const sym = el("span", `mini ${a.status}`, SYMBOL[a.status]);
    sym.setAttribute("aria-label", STATUSWORT[a.status]);
    az.append(tabellenZeile([sym, a.auftrag, a.art, euro(a.betrag)], 3));
  }
  q(".auftragssumme").textContent = euro(ml.summe);
  if (!ml.auftraege.length) q(".auftragszeilen").closest("details").remove();

  zeigePositionsabgleich(q(".positionsabgleich"), m.arbeitsblatt);
  if (m.muster || !m.monat) q(".protokollbereich").remove();
  else q(".protokollknopf").addEventListener("click", () => speichereMonat(m, q(".protokollmeldung")));
  return k;
}

// Punkt antippen -> zum Auftrag im Positionsabgleich springen, aufklappen, Zeile mit Erklärung zeigen
function mitSprung(li, x, karte) {
  if (!x.sprung) return li;
  li.classList.add("sprung");
  li.tabIndex = 0;
  li.setAttribute("role", "button");
  li.lastChild.append(el("span", "sprunghinweis", "→ im Auftrag ansehen"));
  const springe = () => {
    const block = karte.querySelector(".positionsabgleich");
    const auf = block && [...block.querySelectorAll(".auftragabgleich")].find((d) => d.dataset.auftrag === x.sprung.auftrag);
    if (!auf) return;
    block.open = true;
    auf.open = true;
    let ziel = auf;
    const zeile = x.sprung.name && [...auf.querySelectorAll("tr[data-name]")].find((tr) => tr.dataset.name === x.sprung.name);
    if (zeile) {
      ziel = zeile;
      const knopf = zeile.querySelector(".diffknopf");
      if (knopf?.getAttribute("aria-expanded") === "false") knopf.click();
    }
    ziel.scrollIntoView({ behavior: "smooth", block: "center" });
    ziel.classList.remove("aufleuchten");
    void ziel.offsetWidth; // Animation neu starten
    ziel.classList.add("aufleuchten");
  };
  li.addEventListener("click", springe);
  li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); springe(); } });
  return li;
}

// ---------- Brutto-Check: jede Zeile antippen -> Erklärung ----------
const statusAus = (liste) => ["fehler", "hinweis", "plus"].find((s) => liste.some((x) => x.status === s)) ?? "ok";
const zaehlText = (liste) => {
  const n = (s) => liste.filter((x) => x.status === s).length;
  return [n("fehler") ? `${n("fehler")} zu wenig` : null, n("hinweis") ? `${n("hinweis")} unklar` : null, n("plus") ? `${n("plus")} zu deinen Gunsten` : null].filter(Boolean).join(" · ");
};

// Kopfzeile eines zugeklappten Blocks: Symbol + Kurzinfo, damit man ohne Aufklappen sieht, ob etwas rot ist
function klappKopf(details, status, info) {
  details.classList.add(status);
  const sym = details.querySelector("summary .mini");
  sym.classList.add(status);
  sym.textContent = SYMBOL[status];
  sym.setAttribute("aria-label", STATUSWORT[status]);
  details.querySelector(".klappinfo").textContent = info;
}

function zeigeBruttoCheck(box, zeilen) {
  const klapp = box.closest("details");
  if (!zeilen?.length) { klapp.remove(); return; }
  const abw = zeilen.filter((z) => z.status !== "ok");
  klappKopf(klapp, statusAus(abw), abw.length ? zaehlText(abw).replace("zu wenig", "zu wenig bezahlt") : `${zeilen.length} ${zeilen.length === 1 ? "Prüfung passt" : "Prüfungen passen"}`);
  for (const z of zeilen) {
    const d = el("details", `bruttozeile ${z.status}`);
    const s = el("summary");
    const sym = el("span", `mini ${z.status}`, SYMBOL[z.status]);
    sym.setAttribute("aria-label", STATUSWORT[z.status]);
    s.append(sym, el("span", "bruttotitel", z.titel), el("span", "bruttowert", z.wert));
    d.append(s, el("p", "erklaerung", z.text));
    box.append(d);
  }
}

// ---------- Positionsabgleich Arbeitsblatt <-> Akkordabrechnung ----------
const ART_WORT = { gestrichen: "gestrichen", gekürzt: "gekürzt", erhöht: "erhöht", neu: "nicht im Blatt", umgerechnet: "andere Einheit", umgebucht: "umgebucht", flaeche: "gleiche Fläche" };
const plusMinus = (x) => (x < -0.005 ? "minus" : x > 0.005 ? "plus" : null);

function zeigePositionsabgleich(box, ab) {
  const nw = box.querySelector(".nettowirkung");
  if (!ab) {
    klappKopf(box, "info", "keine Arbeitsblätter in der PDF");
    nw.textContent = "In dieser PDF sind keine Arbeitsblätter, darum gibt es keinen Positionsabgleich.";
    nw.classList.add("klein");
    return;
  }
  const abw = [...ab.abgleich.flatMap((a) => [...a.zeilen.filter((z) => !z.ausgeglichen), ...a.hinweise])].filter((z) => z.status !== "ok" && z.status !== "info");
  klappKopf(box, statusAus(abw), [`Netto ${vorzeichenEuro(ab.netto)}`, abw.length ? zaehlText(abw) : "alles wie eingereicht"].join(" · "));
  nw.append("Netto-Wirkung des Monats: ", el("strong", plusMinus(ab.netto), vorzeichenEuro(ab.netto)),
    el("span", "klein block", "Summe aller Abweichungen Arbeitsblatt → Abrechnung (dein Anteil). Vormonat, „läuft weiter“ und vermutliche Tippfehler zählen nicht."));

  const liste = box.querySelector(".abgleichauftraege");
  for (const a of ab.abgleich) liste.append(abgleichAuftrag(a));
}

function abgleichAuftrag(a) {
  const abw = a.zeilen.filter((z) => z.status !== "ok" && !z.ausgeglichen);
  const alle = [...abw, ...a.hinweise, ...(a.aufteilung && !a.aufteilung.ok ? [{ status: "fehler" }] : [])];
  const status = statusAus(alle);
  const d = el("details", `auftragabgleich ${status}`);
  d.dataset.auftrag = a.auftrag; // Sprungziel aus "Abweichungen" / "Zu deinen Gunsten"
  const sum = el("summary");
  const sym = el("span", `mini ${status}`, SYMBOL[status]);
  sym.setAttribute("aria-label", STATUSWORT[status]);
  const zusatz = [a.zeitraum, a.vormonat ? "Vormonat" : null, a.laeuftWeiter ? "läuft weiter" : null,
    abw.length ? `${abw.length} ${abw.length === 1 ? "Abweichung" : "Abweichungen"}` : a.zeilen.length ? "alles wie eingereicht" : null].filter(Boolean).join(" · ");
  sum.append(sym, el("strong", null, `Auftrag ${a.auftrag}`));
  if (a.ort) sum.append(el("span", "baustelle", `📍 ${a.ort}`)); // Straße + Ort vom Arbeitsblatt, nur Anzeige
  sum.append(el("span", "klein", zusatz));
  d.append(sum);

  if (a.zeilen.length) {
    const t = el("table", "abgleichtabelle");
    const kopf = el("tr");
    ["Tätigkeit", "Blatt", "Abger.", "Differenz"].forEach((x, i) => kopf.append(el("th", i ? "zahl" : null, x)));
    const thead = el("thead"), body = el("tbody");
    thead.append(kopf);
    for (const z of a.zeilen) {
      const name = el("span", null, z.name);
      if (z.plus) { const p = el("span", "plusmarke", "+"); p.title = "nachgetragen"; name.prepend(p, " "); }
      const tr = tabellenZeile([name, z.eingereicht ? `${menge(z.eingereicht)} ${z.einheit}`.trim() : "–", z.abgerechnet ? `${menge(z.abgerechnet)} ${z.einheitAbger ?? z.einheit}`.trim() : "–", ""]);
      tr.className = `zeile-${z.status}${z.umbuchung ? " umbuchungszeile" : ""}`;
      tr.dataset.name = z.name;
      body.append(tr);
      if (z.status === "ok" && z.art !== "umgebucht" && z.art !== "flaeche") { tr.lastChild.append(el("span", "okhaken", "✓")); continue; }
      // Rotes/oranges/grünes Feld: antippen zeigt die Erklärung darunter
      const knopf = el("button", `diffknopf ${z.status}`);
      knopf.type = "button";
      const diffText = z.art === "flaeche" ? "±0,00 €" : z.ausgeglichen ? "ausgeglichen" : z.euroDein != null ? vorzeichenEuro(z.euroDein) : z.diff != null ? `${z.diff > 0 ? "+" : "−"}${menge(Math.abs(z.diff))} ${z.einheit}` : "?";
      knopf.append(el("span", "diffart", ART_WORT[z.art]), el("span", "diffwert", diffText));
      knopf.setAttribute("aria-expanded", "false");
      const erkl = el("tr", "erklaerzeile");
      const td = el("td", `erklaerung ${z.status}`, z.erklaerung);
      td.colSpan = 4;
      erkl.append(td);
      erkl.hidden = true;
      knopf.addEventListener("click", () => {
        erkl.hidden = !erkl.hidden;
        knopf.setAttribute("aria-expanded", String(!erkl.hidden));
      });
      tr.lastChild.append(knopf);
      body.append(erkl);
    }
    t.append(thead, body);
    const rahmen = el("div", "tabellenrahmen");
    rahmen.append(t);
    d.append(rahmen);
  }
  if (a.aufteilung) {
    const au = a.aufteilung;
    d.append(el("p", `aufteilung ${au.ok ? "ok" : "fehler"}`, `${au.ok ? "✓" : "✕"} Aufteilung: ${euro(au.summe)}${au.tp ? ` (Tagespauschale ${euro(au.tp)} ungeteilt)` : ""} ÷ ${au.anzahl} Arbeiter = ${euro(au.soll)}${au.ok ? "" : `, abgerechnet sind ${euro(au.anteil)}`} · laut Arbeitsblatt ${a.arbeiterBlatt} Arbeiter`));
  }
  for (const h of a.hinweise) d.append(el("p", `abgleichhinweis ${h.status}`, h.text));
  return d;
}

// ---------- Monatsprotokoll (IndexedDB, nur in diesem Browser) ----------
async function speichereMonat(m, meldungEl) {
  const p = protokollAusMonat(m);
  if (!p) { meldungEl.textContent = "Dieser Monat kann nicht gespeichert werden (Monat unbekannt)."; return; }
  try {
    const alt = await ladeProtokoll(p.monat);
    if (alt && !confirm(`Für ${monatName(p.monat)} gibt es schon ein Protokoll${alt.gespeichert ? ` (gespeichert am ${alt.gespeichert.split("-").reverse().join(".")})` : ""}. Überschreiben?`)) {
      meldungEl.textContent = "Nicht gespeichert, das alte Protokoll bleibt.";
      return;
    }
    await speichereProtokoll(p);
    meldungEl.textContent = `✓ ${monatName(p.monat)} gespeichert: ${p.auftraege.length} Aufträge, ${p.abweichungen.length} Abweichungen, Netto-Wirkung ${vorzeichenEuro(p.netto)}.`;
    await zeigeVerlauf();
  } catch (err) {
    console.error(err);
    meldungEl.textContent = "Speichern geht in diesem Browser nicht (privater Modus?).";
  }
}

// Zuletzt angezeigte Protokolle. Drucken und Sichern nutzen sie sofort, ohne vorher zu warten:
// Safari (iPhone) verwirft Download/Druck, wenn zwischen Tippen und Start auf die Datenbank gewartet wird.
let verlaufCache = [];
const LEER = "Noch keine Monate gespeichert. Nach dem Prüfen kannst du einen Monat mit „Monatsprotokoll speichern“ festhalten.";

async function zeigeVerlauf(meldung) {
  const ul = $("verlaufListe"), info = $("verlaufInfo"), summe = $("verlaufSumme");
  let liste = [], geht = true;
  try { liste = await ladeProtokolle(); } catch { geht = false; }
  verlaufCache = liste;
  ul.replaceChildren();
  for (const p of liste) {
    const li = el("li");
    const text = el("div");
    const n = p.abweichungen.length, u = p.umbuchungen.length;
    text.append(el("strong", null, monatName(p.monat)),
      el("span", "klein block", `${p.auftraege.length} ${p.auftraege.length === 1 ? "Auftrag" : "Aufträge"} · ${n} ${n === 1 ? "Abweichung" : "Abweichungen"}${u ? ` · ${u} mögl. ${u === 1 ? "Umbuchung" : "Umbuchungen"}` : ""}`));
    const weg = el("button", "linkknopf klein", "Löschen");
    weg.type = "button";
    weg.setAttribute("aria-label", `${monatName(p.monat)} löschen`);
    weg.addEventListener("click", async () => {
      if (!confirm(`Protokoll ${monatName(p.monat)} löschen?`)) return;
      await loescheProtokoll(p.monat);
      await zeigeVerlauf(`${monatName(p.monat)} gelöscht.`);
    });
    li.append(text, el("span", `verlaufwert ${plusMinus(p.netto) ?? ""}`, vorzeichenEuro(p.netto)), weg);
    ul.append(li);
  }
  const gesamt = Math.round(liste.reduce((s, p) => s + p.netto, 0) * 100) / 100;
  summe.hidden = !liste.length;
  summe.replaceChildren();
  if (liste.length) summe.append(`Gesamt seit ${monatName(liste[0].monat)}: `, el("strong", plusMinus(gesamt), vorzeichenEuro(gesamt)));
  info.textContent = meldung ?? (!geht ? "Dieser Browser kann keine Protokolle speichern (privater Modus?)." : liste.length ? `${liste.length} ${liste.length === 1 ? "Monat" : "Monate"} gespeichert.` : LEER);
  $("verlaufExport").disabled = !liste.length;
  $("verlaufDrucken").disabled = !liste.length;
  $("verlaufAlleWeg").hidden = !liste.length;
}
zeigeVerlauf();

// ---------- Verlauf drucken / als PDF (Druckfenster des Browsers, nichts verlässt das Gerät) ----------
const DRUCK_ART = { gestrichen: "gestrichen", gekürzt: "gekürzt", erhöht: "erhöht", neu: "nicht im Arbeitsblatt", umgerechnet: "andere Einheit", umgebucht: "umgebucht", flaeche: "gleiche Fläche" };
const wirkungWort = (x) => (x < -0.005 ? "zu deinem Nachteil" : x > 0.005 ? "zu deinen Gunsten" : "ausgeglichen");

function baueDruck(liste) {
  const box = $("druckbereich");
  box.replaceChildren();
  const heute = new Date().toLocaleDateString("de-AT");
  const gesamt = Math.round(liste.reduce((s, p) => s + p.netto, 0) * 100) / 100;
  box.append(el("h1", null, "Lohnzettel-Checker – Verlauf"),
    el("p", "druckklein", `Stand ${heute} · ${liste.length} ${liste.length === 1 ? "Monat" : "Monate"} (${monatName(liste[0].monat)} bis ${monatName(liste.at(-1).monat)})`));

  // Übersicht je Monat
  const t = el("table", "drucktabelle");
  const kopf = el("tr");
  ["Monat", "Aufträge", "Abweichungen", "Netto-Wirkung"].forEach((x, i) => kopf.append(el("th", i ? "zahl" : null, x)));
  const thead = el("thead"), tbody = el("tbody"), tfoot = el("tfoot");
  thead.append(kopf);
  for (const p of liste) tbody.append(tabellenZeile([monatName(p.monat), String(p.auftraege.length), String(p.abweichungen.length), vorzeichenEuro(p.netto)]));
  tfoot.append(tabellenZeile(["Gesamt", "", "", vorzeichenEuro(gesamt)]));
  t.append(thead, tbody, tfoot);
  box.append(el("h2", null, "Übersicht"), t, el("p", "druckklein", `Netto-Wirkung = Summe aller Abweichungen Arbeitsblatt → Abrechnung (dein Anteil). Minus = ${wirkungWort(-1)}, Plus = ${wirkungWort(1)}.`));

  // Details je Monat
  for (const p of liste) {
    const abschnitt = el("section", "druckmonat");
    abschnitt.append(el("h2", null, `${monatName(p.monat)} · Netto ${vorzeichenEuro(p.netto)} (${wirkungWort(p.netto)})`));
    if (p.abweichungen.length) {
      const ta = el("table", "drucktabelle");
      const k = el("tr");
      ["Auftrag", "Tätigkeit", "Art", "Eingereicht", "Abgerechnet", "€"].forEach((x, i) => k.append(el("th", i >= 3 ? "zahl" : null, x)));
      const th = el("thead"), tb = el("tbody");
      th.append(k);
      for (const a of p.abweichungen)
        tb.append(tabellenZeile([a.auftrag, a.taetigkeit, DRUCK_ART[a.art] ?? a.art,
          a.eingereicht ? `${menge(a.eingereicht)} ${a.einheit}` : "–", a.abgerechnet ? `${menge(a.abgerechnet)} ${a.einheitAbger || a.einheit}` : "–",
          a.euro != null ? vorzeichenEuro(a.euro) : "–"], 3));
      ta.append(th, tb);
      abschnitt.append(ta);
    } else abschnitt.append(el("p", null, "Keine Abweichungen: alles wie eingereicht abgerechnet."));
    for (const u of p.umbuchungen)
      abschnitt.append(el("p", "druckklein", `Mögliche Umbuchung: ${menge(u.stunden ?? 0)} Std von Auftrag ${u.von} nach ${u.nach}, Wirkung ${vorzeichenEuro(u.netto ?? 0)}.`));
    abschnitt.append(el("p", "druckklein", `Aufträge: ${p.auftraege.join(", ") || "–"}${p.gespeichert ? ` · gespeichert am ${p.gespeichert.split("-").reverse().join(".")}` : ""}`));
    box.append(abschnitt);
  }
  box.append(el("p", "druckklein", "Erstellt mit dem Lohnzettel-Checker. Ohne Gewähr: Die App rechnet nach, was auf dem Zettel steht."));
}

$("verlaufDrucken").addEventListener("click", () => {
  const liste = verlaufCache;
  if (!liste.length) return;
  baueDruck(liste);
  document.body.classList.add("druckmodus");
  window.print();
});
window.addEventListener("afterprint", () => {
  document.body.classList.remove("druckmodus");
  $("druckbereich").replaceChildren();
});

$("verlaufAlleWeg").addEventListener("click", async () => {
  if (!confirm("Wirklich ALLE gespeicherten Monatsprotokolle löschen? Das geht nicht rückgängig (außer du hast einen Export).")) return;
  await loescheAlleProtokolle();
  await zeigeVerlauf("Alle Protokolle gelöscht.");
});

// "Speichern unter": PC (Chrome/Edge) mit Speichern-Fenster, Handy über das Teilen-Menü
// (iPhone: "In Dateien sichern"), sonst normaler Download. Beides geht nur über https (Online-Version).
$("verlaufExport").addEventListener("click", async () => {
  const liste = verlaufCache;
  if (!liste.length) return;
  const name = `lohnzettel-protokolle-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(exportDaten(liste), null, 2)], { type: "application/json" });
  const info = $("verlaufInfo");
  try {
    if (window.showSaveFilePicker) {
      const datei = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: "Lohnzettel-Sicherung", accept: { "application/json": [".json"] } }] });
      const w = await datei.createWritable();
      await w.write(blob);
      await w.close();
      info.textContent = `Sicherung gespeichert als „${datei.name}“.`;
      return;
    }
    const file = new File([blob], name, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Lohnzettel-Sicherung" });
      info.textContent = "Sicherung weitergegeben. Am iPhone: „In Dateien sichern“ wählen.";
      return;
    }
  } catch (err) {
    if (err?.name === "AbortError") { info.textContent = "Sicherung abgebrochen."; return; }
    console.error(err); // sonst unten normal herunterladen
  }
  // "octet-stream", damit Safari die Datei speichert statt sie nur als Text anzuzeigen
  const url = URL.createObjectURL(new Blob([blob], { type: "application/octet-stream" }));
  const a = el("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  info.textContent = `Sicherung „${name}“ wird heruntergeladen. iPhone: Dateien-App → Downloads (iCloud Drive oder „Auf meinem iPhone“), oder oben in Safari auf den Pfeil ⬇ tippen.`;
});

$("verlaufImport").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const neu = leseExport(JSON.parse(await f.text()));
    if (!neu?.length) { $("verlaufInfo").textContent = `In „${f.name}“ sind keine Monatsprotokolle.`; return; }
    const vorhanden = new Set((await ladeProtokolle()).map((p) => p.monat));
    const doppelt = neu.filter((p) => vorhanden.has(p.monat));
    if (doppelt.length && !confirm(`${doppelt.map((p) => monatName(p.monat)).join(", ")} gibt es schon. Überschreiben?`)) {
      $("verlaufInfo").textContent = "Import abgebrochen, nichts geändert.";
      return;
    }
    for (const p of neu) await speichereProtokoll(p);
    await zeigeVerlauf(`${neu.length} ${neu.length === 1 ? "Monat" : "Monate"} importiert.`);
  } catch (err) {
    console.error(err);
    $("verlaufInfo").textContent = "Die Datei konnte nicht gelesen werden. Ist es ein Export aus dieser App?";
  }
});

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
