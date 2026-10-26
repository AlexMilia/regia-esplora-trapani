# Mappare una chiesa

Come si decidono le scene di un tour 360 dentro un edificio, e come le opere ci si agganciano sopra.
Primo caso reale: il Santuario di Maria SS. di Custonaci.

Versione estesa e illustrata dello studio: <https://claude.ai/artifact/Xdcamoq5e1RLCp43vyRW1r>

---

## Il problema

Il motore del tour è nato per luoghi che si **percorrono**: una scena dopo l'altra, avanti e indietro.
Una chiesa non si percorre, si **guarda**. È una stanza sola con dentro trenta oggetti rivolti in
direzioni diverse, e il visitatore ci gira dentro invece di attraversarla.

Sono due griglie sovrapposte: le **scene** dicono dove puoi stare, le **opere** dicono cosa puoi
guardare da lì. Progetti solo la prima e ottieni un giro elegante in cui non si vede niente; progetti
solo la seconda e ottieni un catalogo che non è un'esperienza.

> **La regola che governa tutto: le scene nascono dalle opere, non dalla planimetria.**
> Prima l'elenco di cosa c'è da mostrare, poi si decide dove piantare il treppiede.

---

## Dove si piantano le scene

Due criteri, in quest'ordine:

1. Una scena **ovunque cambi ciò che si vede** — la soglia, l'incrocio del transetto, i gradini del
   presbiterio.
2. Lungo la navata, **una ogni 6–8 metri**: oltre, il passaggio da un panorama all'altro diventa un
   salto e si perde l'orientamento.

### La numerazione

Il motore **concatena solo gli ordini consecutivi**. Le frecce avanti/indietro nascono da sole fra
`2` e `3`, non fra `4` e `100`. Da qui la convenzione:

| Ordine | Ramo |
|---|---|
| `0, 1, 2, 3, 4, 5…` | la fila principale: sagrato, controfacciata, navata, crociera, presbiterio, abside |
| `100, 101, 102…` | transetto sinistro e cappelle a sinistra |
| `200, 201…` | transetto destro |
| `300…` | navate laterali |
| `400…` | cripte e sotterranei |

Una diramazione si raggiunge **solo dal link** che metti tu dalla scena di smistamento. Se invece
numerassi il transetto `5, 6, 7`, il visitatore uscirebbe dalla navata senza accorgersene credendo di
aver proseguito dritto. Dentro il ramo si torna consecutivi, così anche la diramazione ha le sue
frecce automatiche.

### Quante scene servono

Non si decide sulla pianta, si verifica sulle opere. Il criterio è uno solo: **ogni opera dev'essere
leggibile da almeno una scena.**

Se un dipinto sta a più di una dozzina di metri dal punto di ripresa, o occupa meno di una decina di
gradi del campo visivo, nel panorama c'è il pallino ma l'opera è una macchia. Due strade: aggiungere
una scena più vicina, oppure accettare che il pallino serva solo ad **aprire la scheda**, dove la foto
di dettaglio fa il lavoro vero. Per un altare laterale va benissimo la seconda. Per il quadro titolare
no: quello merita la sua scena ravvicinata.

È anche il motivo per cui **la prima passata in chiesa si fa senza treppiede**.

---

## Mezza giornata in chiesa

1. **Il censimento, col telefono.** Giro completo, una foto di riferimento per ogni opera, numerate.
   È l'elenco da cui nascono le scene — e sono già le foto che serviranno all'AI.
2. **Il piano di ripresa sulla pianta.** Segni i punti e li numeri lì, sulla carta, prima di montare
   niente. Dieci minuti che ne risparmiano due in regia.
3. **Il 360 ad altezza costante.** Treppiede a circa 160 cm, **la stessa per tutte le scene**: altezze
   diverse fanno saltare il pavimento da un panorama all'altro e danno il mal di mare.
4. **Il nord sempre dalla stessa parte.** Così `yaw 0` è sempre la stessa direzione, altrimenti
   `yaw_avanti` va ritarato a occhio scena per scena e le frecce sembrano storte.
5. **Le foto di dettaglio delle opere.** Frontali, senza flash.
6. **Si scrive fuori.** In chiesa si riprende e basta.

---

## Le opere su più scene

Un crocifisso appeso alla crociera si vede dalla navata **e** dal transetto, con due direzioni
completamente diverse. Con un solo `tour_scena_id` l'unica uscita sarebbe duplicare la scheda — cioè
avere due volte la stessa opera nel catalogo, con due descrizioni che da domani divergono.

Da qui `story_opera_scena`:

| Campo | Cosa tiene |
|---|---|
| `opera_id` | la scheda, una sola |
| `scena_id` | una delle scene da cui la si vede |
| `yaw`, `pitch` | dove guardare, *da quella scena* |
| `hfov` | quanto stringere lo zoom quando ci si va sopra |
| `principale` | la vista migliore: quella che apre la scheda |

In regia diventa una lista «in quali scene si vede» al posto di un menù a tendina.

---

## L'AI: trova e posiziona, non attribuisce

Questa è la riga da non superare, ed è anche quella che rende il sistema difendibile davanti a un
parroco o a una Soprintendenza. Il modello guarda il panorama e dice *qui c'è un dipinto, qui una
statua, qui un altare*, con la posizione. **Non dice di chi è, di che anno è, né che santo raffigura.**

**L'AI trova e posiziona. L'uomo nomina.**

Il flusso:

1. Dall'equirettangolare si estraggono viste rettilinee, una ogni 30° di rotazione — in una chiesa
   bastano le fasce basse e centrali.
2. Ogni ritaglio passa da `poi_api.php`, che è già l'unico posto dove vive la chiave: nessuna chiave
   nuova in giro.
3. La posizione nel ritaglio si riconverte in `yaw` e `pitch` con la geometria del ritaglio stesso:
   nessuna stima a occhio.
4. Nasce una **proposta**, non un'opera: `fonte = 'ai'`, `stato = 'proposta'`,
   `visibile_pubblico = false`, titolo provvisorio tipo «Dipinto, parete sinistra».
5. In regia la coda «da confermare» mostra le proposte col loro riquadro dentro il panorama: gli dai
   un nome e diventa una scheda, oppure la scarti.

Tre stati bastano: **proposta** (la macchina l'ha vista), **da_completare** (un umano l'ha confermata
ma la scheda è nuda), **verificata** (pubblicabile). Un vincolo nel database impedisce a una proposta
di essere pubblica.

---

## Non è un metodo per chiese

La stessa griglia regge un museo (sale al posto delle navate), un palazzo, una cripta, una salina —
dove gli attrezzi del salinaio prendono il posto dei quadri — o una cantina. Il campo `tipo` di
`story_opere` contempla già `specie` e `reperto` accanto a `pala_daltare` e `reliquiario`: la tabella
è nata larga.

È il motivo per cui vale la pena farlo bene su Custonaci: quello che esce da lì è il modello per ogni
chiesa, museo e sito visitabile della provincia.
