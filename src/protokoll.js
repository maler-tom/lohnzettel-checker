// Monatsprotokolle: nur Monat, Auftragsnummern, Abweichungen und Netto-Wirkung.
// KEINE Namen, Adressen, SV-Nummer oder IBAN. Gespeichert nur in diesem Browser (IndexedDB).

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const ARTEN = ["gestrichen", "gekürzt", "erhöht", "neu", "umgerechnet"];
const nr = (x) => (typeof x === "number" && Number.isFinite(x) ? r2(x) : null);
const auftragNr = (x) => (typeof x === "string" && /^\d{4,12}$/.test(x) ? x : null);
// Tätigkeitstext kurz halten (Bezeichnung der Arbeit, keine Person)
const taetigkeit = (x) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, 80) : "");

// Aus dem Ergebnis von werteAus() das Protokoll bauen (nur die erlaubten Felder)
export function protokollAusMonat(m) {
  const ab = m.arbeitsblatt;
  const zaehlt = (z) => ["fehler", "hinweis", "plus"].includes(z.status) && !z.unplausibel;
  const auftraege = [...new Set([...m.maler.auftraege.map((a) => a.auftrag), ...(ab?.abgleich ?? []).map((a) => a.auftrag)])].filter(auftragNr).sort();
  return pruefeProtokoll({
    monat: m.monat,
    gespeichert: new Date().toISOString().slice(0, 10),
    auftraege,
    abweichungen: (ab?.abgleich ?? []).flatMap((a) => a.zeilen.filter(zaehlt)).map((z) => ({
      auftrag: z.auftrag, taetigkeit: z.name, art: z.art, einheit: z.einheit, einheitAbger: z.einheitAbger ?? z.einheit,
      eingereicht: z.eingereicht, abgerechnet: z.abgerechnet, euro: z.euroDein,
    })),
    umbuchungen: (ab?.umbuchungen ?? []).map((g) => ({ von: g.von.auftrag, nach: g.nach.auftrag, stunden: g.menge, netto: g.netto })),
    netto: ab?.netto ?? 0,
  });
}

// Für Speichern und Import: nur bekannte Felder mit passendem Typ übernehmen. Ungültig -> null.
export function pruefeProtokoll(p) {
  if (!p || typeof p !== "object" || typeof p.monat !== "string" || !/^20\d\d-(0[1-9]|1[0-2])$/.test(p.monat)) return null;
  return {
    monat: p.monat,
    gespeichert: typeof p.gespeichert === "string" && /^\d{4}-\d\d-\d\d$/.test(p.gespeichert) ? p.gespeichert : null,
    auftraege: (Array.isArray(p.auftraege) ? p.auftraege : []).map(auftragNr).filter(Boolean),
    abweichungen: (Array.isArray(p.abweichungen) ? p.abweichungen : []).filter((a) => a && auftragNr(a.auftrag)).map((a) => ({
      auftrag: a.auftrag, taetigkeit: taetigkeit(a.taetigkeit), art: ARTEN.includes(a.art) ? a.art : "gekürzt",
      einheit: typeof a.einheit === "string" ? a.einheit.slice(0, 6) : "",
      einheitAbger: typeof a.einheitAbger === "string" ? a.einheitAbger.slice(0, 6) : typeof a.einheit === "string" ? a.einheit.slice(0, 6) : "",
      eingereicht: nr(a.eingereicht), abgerechnet: nr(a.abgerechnet), euro: nr(a.euro),
    })),
    umbuchungen: (Array.isArray(p.umbuchungen) ? p.umbuchungen : []).filter((u) => u && auftragNr(u.von) && auftragNr(u.nach))
      .map((u) => ({ von: u.von, nach: u.nach, stunden: nr(u.stunden), netto: nr(u.netto) })),
    netto: nr(p.netto) ?? 0,
  };
}

// Export-Datei lesen: { protokolle: [...] } oder direkt ein Array
export function leseExport(json) {
  const liste = Array.isArray(json) ? json : json?.protokolle;
  if (!Array.isArray(liste)) return null;
  return liste.map(pruefeProtokoll).filter(Boolean);
}

export const exportDaten = (protokolle) => ({ app: "lohnzettel-checker", art: "monatsprotokolle", version: 1, exportiert: new Date().toISOString().slice(0, 10), protokolle });

// ---------- IndexedDB (nur im Browser) ----------
const DB = "lohnzettel-checker", STORE = "protokolle";

function oeffneDb() {
  return new Promise((ok, fehler) => {
    if (typeof indexedDB === "undefined") return fehler(new Error("Kein IndexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "monat" });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fehler(req.error);
  });
}

async function mitStore(modus, tu) {
  const db = await oeffneDb();
  try {
    return await new Promise((ok, fehler) => {
      const tx = db.transaction(STORE, modus);
      const ergebnis = tu(tx.objectStore(STORE));
      tx.oncomplete = () => ok(ergebnis?.result);
      tx.onerror = tx.onabort = () => fehler(tx.error);
    });
  } finally {
    db.close();
  }
}

export const ladeProtokolle = async () => ((await mitStore("readonly", (s) => s.getAll())) ?? []).sort((a, b) => a.monat.localeCompare(b.monat));
export const ladeProtokoll = (monat) => mitStore("readonly", (s) => s.get(monat));
export const speichereProtokoll = (p) => mitStore("readwrite", (s) => s.put(p));
export const loescheProtokoll = (monat) => mitStore("readwrite", (s) => s.delete(monat));
export const loescheAlleProtokolle = () => mitStore("readwrite", (s) => s.clear());
