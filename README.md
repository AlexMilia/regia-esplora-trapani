# Regia Esplora Trapani — Atlante POI

Il codice del portale territoriale immersivo di **Esplora Trapani**: la regia (il pannello con cui si
riempie l'atlante), le pagine pubbliche, le migrazioni del database e gli strumenti di rilievo sul campo.

Non è un sito vetrina. È un atlante di luoghi — chiese, musei, saline, sentieri — raccontati con tour
360, opere d'arte schedate e mappate dentro i panorami, audio, planimetrie e percorsi.

---

## Com'è fatto

**Dati** · Supabase (PostgreSQL). Le pagine pubbliche leggono in sola lettura con la chiave anon e le
policy RLS. **Nessuna pagina scrive direttamente**: ogni scrittura passa da `poi_api.php` sul server,
l'unico posto dove vive la chiave di servizio, con una whitelist di tabelle (`$TABELLE`) e un token di
accesso per la regia.

**Media** · I file pesanti (panorami 360 da 20–30 MB, video, audio) **non stanno nel database né sul
server web**: vivono su Backblaze B2 e nel database c'è solo il link. `b2-media.php` fa da proxy
firmato per leggerli.

**Tabelle principali**

| Tabella | Cosa tiene |
|---|---|
| `story_poi` | il luogo: nome, comune, coordinate, planimetria, categoria |
| `story_tour_scene` | i punti di ripresa del tour 360: panorama, ordine, yaw, link fra scene, posizione sulla pianta |
| `story_opere` | la scheda catalografica di un'opera: autore, ambito, datazione, materia, stato, foto |
| `story_opera_scena` | ponte: da quali scene si vede un'opera, e con che `yaw`/`pitch` da ciascuna |
| `story_rilievo` | una giornata di riprese: scarto d'orologio, cartella B2, dispositivo |
| `story_tappe`, `story_segnalazioni` | tappe dei percorsi e segnalazioni dal pubblico |

**Viste** · `v_poi_scheda`, `v_opera_scena`, `v_opere_da_confermare`, `v_piano_rilievo`,
`v_rilievo_quadro`.

---

## Le regole del progetto

Valgono per ogni file che entra qui.

1. **Si consegna solo codice testato.** Niente pagine "a occhio": ogni consegna gira con i suoi test
   (Playwright per le pagine, SQL eseguito due volte su PostgreSQL locale per le migrazioni).
2. **Tutti i testi sono multilingua.** Italiano più EN/FR/ES nella colonna `tr` (jsonb).
3. **Un campo non compilato non si mostra mai.** Nessun "—", nessuna etichetta vuota, nessun
   placeholder: la sezione semplicemente non esiste.
4. **Le pagine sono immersive.** Mai elenchi o listini: foto, 360, racconto. Per il 360 si usa
   Pannellum.
5. **Ogni consegna cambia nome file** (`poi21.html` → `poi22.html`, `editorpoi43.html` →
   `editorpoi44.html`) per scavalcare la cache del browser. Con la repo in piedi questo vincolo si può
   sostituire con un `?v=<commit>`.
6. **Ogni sviluppo passa da un controllo di sicurezza e UX**, desktop e mobile.
7. **Le chiavi non entrano mai nel codice versionato.** Vedi [`docs/sicurezza.md`](docs/sicurezza.md).

---

## Cosa c'è in questa repo

```
docs/       il metodo: come si mappa un luogo, come si numerano le scene, cosa non va committato
sql/        le migrazioni, una per blocco, rieseguibili
rilievo/    gli strumenti di rilievo sul campo (telefono in chiesa + abbinamento a casa)
studi/      gli studi di progetto, in pagina HTML
```

Mancano ancora tre cartelle, da creare quando i file arrivano qui:

- `regia/` — il pannello di redazione (`editorpoi*.html`)
- `pubblico/` — le pagine pubbliche (`poi*.html`, `home*.html`, `blocchi*.html`)
- `test/` — i test Playwright delle pagine

Quei file oggi vivono solo sul server (`alessandromilia.it`): vanno caricati qui, e da lì in poi
questa repo diventa la fonte di verità.

---

## Il rilievo sul campo

Il pezzo più recente. Il problema: in una chiesa grande si fanno centinaia di scatti e poi, a casa,
non si sa più quale panorama corrisponde a quale punto.

La soluzione è che **il piano di ripresa è l'elenco delle scene**: una scena può nascere prima di
andare sul posto, senza panorama, come punto che aspetta lo scatto. Sul campo si tocca «sono qui»,
a casa si riempie. Stessa riga di `story_tour_scene` dall'inizio alla fine.

L'ancora fra telefono e fotocamera è il **tempo** (Insta360 X6, in interni) o la **distanza GPS**
(DJI Avata 360, in esterni).

- `sql/rilievo1.sql` — la migrazione: `story_rilievo`, le colonne di campo su `story_tour_scene`,
  lo stato calcolato `stato_rilievo` (`da_riprendere` → `scattata` → `abbinata` → `pubblicata`),
  il parapetto che impedisce a una scena senza panorama di finire nel tour.
- `rilievo/rilievo-sim1.html` — la pagina del telefono, da usare in chiesa. Offline, nessun server.
- `rilievo/abbina-sim1.html` — la pagina del PC: carichi il JSON del telefono e le foto, lei propone
  gli abbinamenti, tu correggi, scarichi `rinomina.bat`/`rinomina.sh`.
- `rilievo/LEGGIMI-rilievo.txt` — istruzioni d'uso, cosa è testato e cosa no.
- `rilievo/test.js` — 91 controlli, Chromium headless.

---

## Stato dei lavori

**Fatto** · tour 360 con scene concatenate e diramazioni · schede opere catalografiche · opere mappate
su più scene (`story_opera_scena`) · stati dell'opera (`proposta` / `da_completare` / `verificata`) ·
home a blocchi · migrazione del rilievo · pagine di rilievo e abbinamento in simulazione.

**Da fare** · la regia che mostra le scene «da riprendere» · `b2-media.php` che inoltra l'header
`Range` (serve per leggere l'EXIF senza scaricare tutto il file) · il ritaglio del panorama e
l'endpoint di riconoscimento AI in `poi_api.php` · la coda «da confermare» in regia · planimetrie su
più piani.

**La riga da non superare sull'AI**: *trova e posiziona, non attribuisce.* Il modello dice «qui c'è un
dipinto» con la posizione, mai di chi è o che santo raffigura. Un'opera proposta dall'AI nasce
nascosta al pubblico e diventa visibile solo quando una persona l'ha guardata e le ha dato un nome.

---

Esplora Trapani — Alessandro Milia
