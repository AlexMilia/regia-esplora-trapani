#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera in ./finta/ una sessione di rilievo FINTA ma realistica, per provare
le pagine rilievo-sim1.html (Contapunti) e abbina-sim1.html (Abbina).

Cosa produce:
  finta/rilievo-<slug>-<data>.json   la sessione del telefono (10 punti toccati)
  finta/IMG_*.jpg                    13 JPEG "360" finti 2048x1024 con EXIF DateTimeOriginal
  finta/ATTESO.json                  l'abbinamento giusto, usato dal test

Scenario simulato:
  - cammino 0,1,2,3 -> deviazione 100,101 -> ritorno 4,5 -> deviazione 200 -> ritorno 6
  - tocchi a intervalli di 2-4 minuti
  - l'orologio della camera e' AVANTI di 2 minuti e 13 secondi (133 s) rispetto al telefono
  - il punto 2 ha una raffica di 3 scatti, il punto 100 una raffica di 2 (entro 40 s)
  - il punto 101 e' stato toccato ma lo scatto manca
  - una foto e' stata scattata prima dell'inizio del rilievo (senza punto)

Nota sul conteggio: 9 punti con foto + 2 scatti extra (raffica da 3) + 1 scatto extra
(raffica da 2) + 1 foto prima dell'inizio = 13 file. La consegna parlava di "12 JPEG":
con i vincoli richiesti la somma fa 13, non 12.

Uso:  python3 genera_sessione_finta.py            (scrive in ./finta/ accanto allo script)
"""
import json
import os
import re
import shutil
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont

ZONA = ZoneInfo("Europe/Rome")
CHIESA = "Chiesa del Purgatorio"
# Orario di inizio fisso: cosi' ATTESO.json e' sempre uguale (test ripetibile)
INIZIO = datetime(2026, 10, 14, 9, 30, 0, tzinfo=ZONA)
SCARTO_CAMERA_SEC = 133  # la camera e' avanti di 2 min 13 s rispetto al telefono

# Ogni punto: ordine, tipo, secondi dall'inizio al tocco "sono qui",
# da_punto (solo per le deviazioni), e lista dei ritardi (in secondi dal tocco)
# a cui la camera ha scattato. Lista vuota = scatto mancante.
PUNTI = [
    # ordine, tipo,        tocco,  da_punto, ritardi scatti (s dal tocco)
    (0,   "sagrato",   0 * 60 + 40,  None, [32]),
    (1,   "navata",    3 * 60 + 30,  None, [40]),
    (2,   "navata",    6 * 60 + 10,  None, [38, 38 + 18, 38 + 18 + 19]),  # raffica di 3 entro 40 s
    (3,   "altare",    9 * 60 + 20,  None, [45]),
    (100, "cappella", 11 * 60 + 40,  3,    [35, 35 + 24]),                # raffica di 2 entro 40 s
    (101, "cappella", 14 * 60 + 0,   3,    []),                           # toccato ma scatto mancante
    (4,   "transetto", 17 * 60 + 30, None, [50]),
    (5,   "navata",    19 * 60 + 40, None, [42]),
    (200, "cripta",    23 * 60 + 30, 5,    [55]),
    (6,   "sagrato",   26 * 60 + 20, None, [36]),
]
FINE_DOPO_ULTIMO_SEC = 3 * 60
# Foto scattata prima dell'inizio (prova della camera sul sagrato): 4 minuti prima
FOTO_PRIMA_SEC = -4 * 60

NOTE = {
    0: "Facciata, portale barocco",
    3: "Altare maggiore, luce dalla cupola",
    100: "Cappella laterale sinistra, ex voto",
    200: "Cripta, scale strette: attenzione al treppiede",
}
BUSSOLE = {0: 182.0, 1: 95.5, 2: 93.0, 3: 90.0, 100: 12.0, 101: 20.5, 4: 270.0, 5: 92.0, 200: 180.0, 6: 2.0}

COLORI = [
    (34, 97, 160), (176, 58, 46), (39, 120, 72), (150, 90, 20), (88, 60, 140),
    (20, 120, 130), (120, 120, 30), (160, 50, 110), (60, 60, 60), (200, 120, 40),
    (40, 140, 180), (110, 40, 40), (70, 100, 50), (130, 70, 160),
]


def slugify(testo):
    s = testo.lower()
    s = re.sub(r"[àáâä]", "a", s)
    s = re.sub(r"[èéêë]", "e", s)
    s = re.sub(r"[ìíîï]", "i", s)
    s = re.sub(r"[òóôö]", "o", s)
    s = re.sub(r"[ùúûü]", "u", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "chiesa"


def iso_utc(dt):
    """Stesso formato di new Date().toISOString() nel browser: UTC con la Z e i millisecondi."""
    return dt.astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def exif_str(dt):
    """Formato EXIF 'YYYY:MM:DD HH:MM:SS' nell'ora locale della camera."""
    return dt.astimezone(ZONA).strftime("%Y:%m:%d %H:%M:%S")


def disegna_foto(percorso, testo, sotto, colore, dt_camera, little_endian=False):
    """Crea un JPEG 2048x1024 (proporzioni 2:1 come un equirettangolare) con il testo grande.
    little_endian: scrive il blocco EXIF con byte order II invece di MM, per provare entrambi i casi del parser."""
    img = Image.new("RGB", (2048, 1024), colore)
    d = ImageDraw.Draw(img)
    # Griglia leggera per ricordare un panorama equirettangolare
    for x in range(0, 2048, 256):
        d.line([(x, 0), (x, 1024)], fill=tuple(min(255, c + 25) for c in colore), width=2)
    for y in range(0, 1024, 256):
        d.line([(0, y), (2048, y)], fill=tuple(min(255, c + 25) for c in colore), width=2)
    try:
        f_grande = ImageFont.load_default(size=420)
        f_piccolo = ImageFont.load_default(size=70)
    except TypeError:  # Pillow vecchio senza parametro size
        f_grande = f_piccolo = ImageFont.load_default()
    bb = d.textbbox((0, 0), testo, font=f_grande)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((2048 - w) / 2 - bb[0], (1024 - h) / 2 - bb[1] - 60), testo, fill=(255, 255, 255), font=f_grande)
    bb2 = d.textbbox((0, 0), sotto, font=f_piccolo)
    w2 = bb2[2] - bb2[0]
    d.text(((2048 - w2) / 2 - bb2[0], 820), sotto, fill=(255, 255, 255), font=f_piccolo)

    exif = Image.Exif()
    exif[0x010F] = "Insta360"           # Make
    exif[0x0110] = "X6 (finta)"         # Model
    exif[0x0132] = exif_str(dt_camera)  # DateTime (IFD0)
    ifd_exif = exif.get_ifd(0x8769)
    ifd_exif[36867] = exif_str(dt_camera)  # 0x9003 DateTimeOriginal
    ifd_exif[36868] = exif_str(dt_camera)  # 0x9004 DateTimeDigitized
    if little_endian:
        exif.endian = "<"   # byte order "II" (Pillow scrive "MM" se non indicato)
    img.save(percorso, "JPEG", quality=82, exif=exif.tobytes())
    # Anche la data del file = orologio della camera (come farebbe la scheda SD)
    ts = dt_camera.timestamp()
    os.utime(percorso, (ts, ts))


def main():
    base = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(base, "finta")
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)

    slug = slugify(CHIESA)
    punti_json = []
    scatti = []  # (dt_vero, ordine, idx_in_raffica, tot_raffica)
    for ordine, tipo, tocco_sec, da_punto, ritardi in PUNTI:
        dt_tocco = INIZIO + timedelta(seconds=tocco_sec)
        p = {
            "ordine": ordine,
            "tipo": tipo,
            "ora": iso_utc(dt_tocco),
            "bussola": BUSSOLE.get(ordine),
            "nota": NOTE.get(ordine, ""),
            "rifare": False,
        }
        if da_punto is not None:
            p["da_punto"] = da_punto
        punti_json.append(p)
        for i, r in enumerate(ritardi):
            scatti.append((dt_tocco + timedelta(seconds=r), ordine, i + 1, len(ritardi)))

    dt_fine = INIZIO + timedelta(seconds=PUNTI[-1][2] + FINE_DOPO_ULTIMO_SEC)
    sessione = {
        "chiesa": CHIESA,
        "slug": slug,
        "inizio": iso_utc(INIZIO),
        "fine": iso_utc(dt_fine),
        "punti": punti_json,
        "versione": 1,
    }
    nome_json = f"rilievo-{slug}-{INIZIO.strftime('%Y-%m-%d')}.json"
    with open(os.path.join(out, nome_json), "w", encoding="utf-8") as fh:
        json.dump(sessione, fh, ensure_ascii=False, indent=2)

    # Foto prima dell'inizio (senza punto)
    scatti.append((INIZIO + timedelta(seconds=FOTO_PRIMA_SEC), None, 1, 1))
    scatti.sort(key=lambda s: s[0])

    atteso_scene = {p["ordine"]: {"ordine": p["ordine"], "tipo": p["tipo"], "file_originale": None,
                                  "nuovo_nome": None, "raffica": []} for p in punti_json}
    senza_punto = []
    file_per_ordine = {}
    for n, (dt_vero, ordine, idx, tot) in enumerate(scatti, start=1):
        dt_camera = dt_vero + timedelta(seconds=SCARTO_CAMERA_SEC)  # la camera e' avanti
        nome = f"IMG_{dt_camera.strftime('%Y%m%d_%H%M%S')}_00_{n:03d}.jpg"
        if ordine is None:
            testo, sotto = "PRIMA", "scattata prima dell'inizio - senza punto"
            senza_punto.append(nome)
        else:
            testo = str(ordine)
            sotto = f"punto {ordine} - scatto {idx} di {tot}" if tot > 1 else f"punto {ordine}"
            atteso_scene[ordine]["raffica"].append(nome)
            # la scelta predefinita e' l'ultimo scatto della raffica
            atteso_scene[ordine]["file_originale"] = nome
            atteso_scene[ordine]["nuovo_nome"] = f"{str(ordine).zfill(3)}-{atteso_scene[ordine]['tipo']}.jpg"
            file_per_ordine.setdefault(ordine, []).append((dt_camera, nome))
        # byte order alternato (II / MM) per esercitare entrambi i rami del parser EXIF di abbina-sim1.html
        disegna_foto(os.path.join(out, nome), testo, sotto, COLORI[(n - 1) % len(COLORI)], dt_camera, little_endian=(n % 2 == 0))

    # File extra (fuori dallo scenario, in finta/extra/): JPEG con il solo DateTime 0x0132 in IFD0,
    # senza Exif IFD, per provare il ripiego del parser.
    extra = os.path.join(out, "extra")
    os.makedirs(extra)
    img = Image.new("RGB", (640, 320), (90, 90, 90))
    ex2 = Image.Exif()
    dt_extra = INIZIO + timedelta(minutes=45)
    ex2[0x0132] = exif_str(dt_extra)
    img.save(os.path.join(extra, "solo-ifd0-datetime.jpg"), "JPEG", quality=80, exif=ex2.tobytes())
    with open(os.path.join(extra, "solo-ifd0-datetime.txt"), "w", encoding="utf-8") as fh:
        fh.write(exif_str(dt_extra) + "\n")

    # Scarto atteso dopo "Ricava dal primo abbinamento": ora_tocco(punto 0) - ora_exif(prima foto del punto 0)
    dt_tocco0 = INIZIO + timedelta(seconds=PUNTI[0][2])
    dt_exif_0 = min(file_per_ordine[0])[0]
    scarto_atteso = round((dt_tocco0 - dt_exif_0).total_seconds())

    atteso = {
        "chiesa": CHIESA,
        "slug": slug,
        "sessione_json": nome_json,
        "scarto_camera_sec": SCARTO_CAMERA_SEC,
        "scarto_sec_atteso": scarto_atteso,
        "prima_foto_punto_0": min(file_per_ordine[0])[1],
        "scene": [atteso_scene[p["ordine"]] for p in punti_json],
        "mancanti": [o for o, s in atteso_scene.items() if s["file_originale"] is None],
        "senza_punto": senza_punto,
        "totale_foto": len(scatti),
    }
    with open(os.path.join(out, "ATTESO.json"), "w", encoding="utf-8") as fh:
        json.dump(atteso, fh, ensure_ascii=False, indent=2)

    print(f"Scritti in {out}:")
    print(f"  {nome_json}  ({len(punti_json)} punti)")
    print(f"  {len(scatti)} JPEG, di cui 1 prima dell'inizio; punti senza scatto: {atteso['mancanti']}")
    print(f"  ATTESO.json  (scarto atteso dopo 'Ricava dal primo abbinamento': {scarto_atteso} s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
