# -*- coding: utf-8 -*-
"""Erzeugt beispiel/muster-lohnzettel.pdf: erfundene Daten im Layout des echten Lohnzettels.

Passwort: muster
Seite 1: Gehaltsseite. Seite 2: eigener Auftrag. Seite 3: Team-Auftrag.
Absichtliche Fehler:
  1. Reisekosten 40 × 6,34 sind 253,60 €, gedruckt sind 243,60 €.
  2. Team-Auftrag: die Tagespauschale wurde durch 2 geteilt (steht jedem Maler voll zu).
Aufruf: python tools/beispiel-erstellen.py   (braucht PyMuPDF)
"""
import os
import fitz

CH = 7.2  # Courier 12 pt: 7,2 pt pro Zeichen
OUT = os.path.join(os.path.dirname(__file__), "..", "beispiel", "muster-lohnzettel.pdf")
# Die eingebaute Helvetica kann kein € -> Arial (Windows) für die Auftragsseiten
ARIAL = os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts", "arial.ttf")
ARIAL_FONT = fitz.Font(fontfile=ARIAL)


def de(x):
    return f"{x:,.2f}".replace(",", "§").replace(".", ",").replace("§", ".")


doc = fitz.open()

# ---------- Seiten 2 + 3: Arbeiter-Abrechnungen (Querformat, Helvetica) ----------
# (Bezeichnung, Menge, Einheit, Satz)
AUFTRAEGE = [
    ("10000001", "Max Muster", "24.09.2026", [
        ("Fahrtpauschale - Zone: 1", 5, "x", 3.09),
        ("Regiestundensatz", 10, "Std", 18.10),
        ("Spachteln - 2x", 600, "m²", 1.40),
        ("Streichen - 2x weiß", 400, "m²", 1.00),
        ("Vorstreichen", 400, "m²", 0.52),
    ]),
    ("10000002", "Max Muster + Erika Beispiel", "25.09.2026", [
        ("Spachteln - 2x", 300, "m²", 1.40),
        ("Tagespauschale 21.09.2026", 8.5, "Std", 21.00),
        ("Tagespauschale 22.09.2026", 8.5, "Std", 21.00),
        ("Tagespauschale 23.09.2026", 8.5, "Std", 21.00),
        ("Tagespauschale 24.09.2026", 8.5, "Std", 21.00),
    ]),
]
monatslohn = 0.0
arbeiter_seiten = []
for auftrag, name, vom, pos in AUFTRAEGE:
    p = fitz.open()
    seite = p.new_page(width=842, height=595)
    H2 = 595

    def links(x, y, t, size=9):
        seite.insert_text((x, H2 - y), t, fontname="arial", fontfile=ARIAL, fontsize=size)

    def rechts(r, y, t, size=9):
        links(r - ARIAL_FONT.text_length(t, fontsize=size), y, t, size)

    links(48, 533.8, "Lohnabrechnung Arbeiter", 14)
    links(631, 533.8, "SEPTEMBER 2026", 14)
    links(48, 505.4, f"Name: {name}", 12)
    links(48, 485.2, f"Auftrag-Nr.: {auftrag}")
    links(753, 485.2, "Seite 1")
    for x, t in [(50, "AuftragNr."), (126.5, "ausgeführte Arbeiten"), (491, "Anzahl"), (586, "50%"), (633, "10%"), (682, "Euro"), (741, "Gesamt")]:
        links(x, 472.3, t)
    links(50, 459.7, auftrag)
    links(127, 459.7, "Maler- und Anstreicharbeiten")
    y = 447.5
    summe = stunden = 0.0
    for bez, menge, einheit, satz in pos:
        betrag = round(menge * satz, 2)
        summe += betrag
        stunden += menge if einheit == "Std" else 0
        links(127, y, bez)
        rechts(527, y, de(menge))
        links(530, y, einheit)
        rechts(707, y, de(satz))
        links(711.8, y, "€")
        rechts(791, y, de(betrag) + " €")
        y -= 12
    summe = round(summe, 2)
    links(393, 79, "Summe Stunden:")
    rechts(527, 79, de(stunden))
    links(666, 79, "Summe:")
    rechts(791, 79, de(summe) + " €")
    if "+" in name:
        anteil = round(summe / 2, 2)  # absichtlicher Fehler: Tagespauschale mitgeteilt
        links(623, 67, "Anzahl Arbeiter: 2")
        rechts(780, 67, de(anteil))
        links(785, 67, "€")
        monatslohn += anteil
    else:
        monatslohn += summe
    links(49, 44, f"vom: {vom}")
    arbeiter_seiten.append(p)
monatslohn = round(monatslohn, 2)

# ---------- Seite 1: Gehaltsseite (Hochformat, Courier) ----------
H = 842
page = doc.new_page(width=595, height=H)


def links(x, y, text):
    page.insert_text((x, H - y), text, fontname="cour", fontsize=12)


def rechts(r, y, text):
    links(r - len(text) * CH, y, text)


links(28.8, 785.3, "BEISPIEL - erfundene Daten zum Ausprobieren")
links(28.8, 737.3, "Muster Malerbetrieb GmbH")
rechts(547.2, 737.3, "09.2026")
links(28.8, 677.3, "Max Muster")
links(367.2, 653.3, "Maler")
rechts(547.2, 569.3, "EUR")

# (Code, Name, Menge, Satz, Betrag)
bezuege = [
    ("135", "Monatslohn", 169.00, None, monatslohn),
    ("295", "Sonn- u.Feiert.-Entgelt", 1.00, 140.00, 140.00),
    ("451", "Reisekostenverg.pauschal", 40.00, 6.34, 243.60),  # absichtlicher Fehler (richtig: 253,60)
    ("451", "Reisekostenverg.pauschal", 60.00, 1.81, 108.60),
    ("452", "Tagegeld Stadtgebiet", 30.00, 1.81, 54.30),
]
y = 545.3
for code, name, menge, satz, betrag in bezuege:
    links(79.2, y, code)
    links(108.0, y, name)
    rechts(360.0, y, de(menge))
    if satz is not None:
        rechts(446.4, y, de(satz))
    rechts(547.2, y, de(betrag))
    y -= 12
summe = round(sum(b[4] for b in bezuege), 2)
links(108.0, y, "_" * 61); y -= 12
links(108.0, y, "_" * 61)
links(108.0, y, "Summe der Bezüge:")
rechts(547.2, y, de(summe)); y -= 12

basis = round(sum(b[4] for b in bezuege if b[0] != "451" and not b[0].startswith("5")), 2)
sv = round(basis * 0.1807, 2)
lst_basis = round(basis - sv, 2)
lst = 280.00
abzuege = round(sv + lst, 2)
netto = round(summe - abzuege, 2)
mv = round(basis * 0.0153, 2)

links(79.2, y, "904"); links(108.0, y, "Urlaubssaldo (Tage)"); rechts(360.0, y, de(25)); y -= 12
links(79.2, y, "9710"); links(115.2, y, "MA-Vorsorge Bem. lfd."); rechts(446.4, y, de(basis)); y -= 12
links(79.2, y, "9770"); links(115.2, y, "MA-Vorsorge Beitrag"); rechts(446.4, y, de(mv))

rechts(151.2, 257.3, de(basis)); rechts(345.6, 257.3, de(lst_basis))
rechts(151.2, 245.3, de(sv)); rechts(345.6, 245.3, de(lst)); rechts(547.2, 245.3, de(abzuege))
links(28.8, 209.3, "IBAN: AT00 0000 0000 0000 0000; BIC: MUSTATXXXXX")
rechts(547.2, 209.3, de(netto))

for p in arbeiter_seiten:
    doc.insert_pdf(p)
doc.subset_fonts()  # nur die benutzten Zeichen einbetten -> kleine Datei
doc.save(OUT, garbage=4, deflate=True, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="muster", owner_pw="muster-besitzer")
print("geschrieben:", os.path.abspath(OUT), "| Monatslohn", de(monatslohn), "| Summe", de(summe), "| Netto", de(netto))
