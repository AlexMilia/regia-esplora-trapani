#!/usr/bin/env node
/*
 * Test end-to-end con Playwright (Chromium headless) delle due pagine:
 *   rilievo-sim1.html  (Contapunti, viewport 390x844 come un telefono)
 *   abbina-sim1.html   (Abbina, viewport 1440x900 come un PC)
 *
 * Prima di lanciarlo:  python3 genera_sessione_finta.py   (crea ./finta/)
 * Poi:                 node test.js
 *
 * Esce con codice 0 se tutti i controlli passano, 1 altrimenti.
 */
'use strict';
let chromium;
try { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }   // percorso dell'ambiente di sviluppo
catch (e) { ({ chromium } = require('playwright')); }                          // altrove: npm install playwright && npx playwright install chromium
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const FINTA = path.join(DIR, 'finta');
const TMP = path.join(DIR, 'test-out');   // screenshot e file temporanei del test
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const esiti = [];
function verifica(nome, condizione, dettaglio) {
  esiti.push({ nome, ok: !!condizione, dettaglio: dettaglio === undefined ? '' : String(dettaglio) });
  console.log((condizione ? '  OK   ' : '  FAIL ') + nome + (dettaglio !== undefined && !condizione ? '  -> ' + dettaglio : ''));
}
function uguali(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function sorveglia(page, nomePagina) {
  const errori = [];
  page.on('pageerror', e => errori.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errori.push('console.error: ' + m.text()); });
  page.on('dialog', async d => { errori.push('dialog nativo: ' + d.type() + ' "' + d.message() + '"'); await d.dismiss(); });
  page.on('request', r => {
    const u = r.url();
    if (!/^(file:|data:|blob:|about:)/.test(u)) errori.push('richiesta di rete: ' + u);
  });
  return () => {
    verifica(nomePagina + ': zero errori in console, zero dialog nativi, zero richieste di rete', errori.length === 0, errori.join(' | '));
  };
}

/** Controlla che ogni elemento visibile con testo abbia font-size >= 16px. Restituisce i trasgressori. */
async function testiPiccoli(page) {
  return page.evaluate(() => {
    const cattivi = [];
    const tutti = document.querySelectorAll('body *');
    tutti.forEach(e => {
      let haTesto = false;
      e.childNodes.forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) haTesto = true; });
      if (!haTesto) return;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = e.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const fs = parseFloat(cs.fontSize);
      if (fs < 16) cattivi.push((e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').join('.') : '')) + '=' + fs + 'px');
    });
    return cattivi;
  });
}

// ====================================================================
// CONTAPUNTI
// ====================================================================
async function testContapunti(browser) {
  console.log('\n== Contapunti (rilievo-sim1.html) ==');
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    timezoneId: 'Europe/Rome', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write', 'microphone']
  });
  const page = await ctx.newPage();
  const chiudiSorveglianza = sorveglia(page, 'Contapunti');
  const url = 'file://' + path.join(DIR, 'rilievo-sim1.html');
  await page.goto(url);

  // --- schermata iniziale
  verifica('schermata iniziale visibile, schermata rilievo nascosta',
    await page.isVisible('#schermata-inizio') && !(await page.isVisible('#schermata-rilievo')));
  await page.click('#btn-inizia');
  verifica('senza nome della chiesa non parte e mostra un aiuto',
    await page.isVisible('#schermata-inizio') && (await page.textContent('#inizio-aiuto')).includes('nome'));
  await page.fill('#chiesa', 'Chiesa del Purgatorio');
  await page.click('#btn-inizia');
  await page.waitForSelector('#schermata-rilievo', { state: 'visible' });
  verifica('«Inizia il rilievo» apre la schermata del rilievo e registra l\'ora di inizio',
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('rilievo_sessione')); return !!s.inizio && s.chiesa === 'Chiesa del Purgatorio' && s.slug === 'chiesa-del-purgatorio'; }));

  // --- tasti: dimensioni e testo
  for (const id of ['btn-nuovo', 'btn-deviazione', 'btn-torno']) {
    const b = await page.locator('#' + id).boundingBox();
    verifica(`tasto #${id} ha box >= 64px (${Math.round(b.width)}x${Math.round(b.height)}) e sta nella meta' bassa dello schermo`,
      b.width >= 64 && b.height >= 64 && b.y >= 844 / 2, JSON.stringify(b));
  }
  // autoverifica del controllo sui testi: un elemento da 12px inserito apposta deve essere trovato
  await page.evaluate(() => { const s = document.createElement('span'); s.id = 'esca-test'; s.textContent = 'esca'; s.style.fontSize = '12px'; document.body.appendChild(s); });
  let piccoli = await testiPiccoli(page);
  verifica('il controllo dei testi piccoli funziona (trova l\'esca da 12px)', piccoli.length === 1 && piccoli[0].startsWith('span#esca-test'), piccoli.join(', '));
  await page.evaluate(() => document.getElementById('esca-test').remove());
  piccoli = await testiPiccoli(page);
  verifica('tutti i testi visibili sono >= 16px (schermata rilievo vuota)', piccoli.length === 0, piccoli.join(', '));

  // --- sequenza di tocchi che riproduce la sessione finta
  const chip = async (tipo) => page.click(`#chips .chip[data-tipo="${tipo}"]`);
  const N = async () => page.click('#btn-nuovo');
  const D = async () => page.click('#btn-deviazione');
  const T = async () => page.click('#btn-torno');

  await chip('sagrato'); await N();                 // 0
  await D(); await T();                             // deviazione aperta e chiusa senza punti: non deve consumare il 100
  await chip('navata'); await N(); await N();       // 1, 2
  await chip('altare'); await N();                  // 3
  await D(); await chip('cappella'); await N(); await N();   // 100, 101
  await T();
  await chip('transetto'); await N();               // 4
  await chip('navata'); await N();                  // 5
  await D(); await chip('cripta'); await N();       // 200
  await T();
  await chip('sagrato'); await N();                 // 6
  await page.fill('#pp-nota', 'Facciata, portale barocco');

  const leggi = () => page.evaluate(() => JSON.parse(localStorage.getItem('rilievo_sessione')));
  let s = await leggi();
  const ordiniAttesi = [0, 1, 2, 3, 100, 101, 4, 5, 200, 6];
  verifica('ordini = 0,1,2,3,100,101,4,5,200,6', uguali(s.punti.map(p => p.ordine), ordiniAttesi), s.punti.map(p => p.ordine).join(','));
  verifica('tipi registrati dai chip (sagrato,navata,navata,altare,cappella,cappella,transetto,navata,cripta,sagrato)',
    uguali(s.punti.map(p => p.tipo), ['sagrato', 'navata', 'navata', 'altare', 'cappella', 'cappella', 'transetto', 'navata', 'cripta', 'sagrato']), s.punti.map(p => p.tipo).join(','));
  verifica('da_punto: 100 e 101 partono dal 3, 200 dal 5, i punti principali non lo hanno',
    s.punti.filter(p => p.ordine === 100 || p.ordine === 101).every(p => p.da_punto === 3) &&
    s.punti.find(p => p.ordine === 200).da_punto === 5 &&
    s.punti.filter(p => p.ordine < 100).every(p => p.da_punto === undefined));
  verifica('ogni punto ha ora ISO valida, bussola null (nessun sensore in headless), rifare=false, nota stringa',
    s.punti.every(p => !isNaN(Date.parse(p.ora)) && /Z$/.test(p.ora) && p.bussola === null && p.rifare === false && typeof p.nota === 'string'));
  verifica('le ore dei punti sono crescenti', s.punti.every((p, i) => i === 0 || Date.parse(p.ora) >= Date.parse(s.punti[i - 1].ora)));
  verifica('nota di testo salvata sull\'ultimo punto (6)', s.punti.find(p => p.ordine === 6).nota === 'Facciata, portale barocco');
  verifica('il tasto «Torno al cammino» e\' disabilitato fuori da una deviazione', await page.isDisabled('#btn-torno'));
  verifica('schema SVG: 10 nodi, l\'ultimo evidenziato, 2 rami laterali su lati opposti',
    await page.evaluate(() => {
      const nodi = document.querySelectorAll('#schema g.nodo');
      const ultimo = document.querySelector('#schema g.nodo.ultimo');
      const cx = o => +document.querySelector(`#schema g.nodo[data-ordine="${o}"] circle`).getAttribute('cx');
      return nodi.length === 10 && ultimo && ultimo.dataset.ordine === '6' && cx(100) !== cx(0) && cx(200) !== cx(0) && cx(100) !== cx(200) && cx(0) === cx(6);
    }));
  verifica('schema SVG: ogni nodo mostra numero, tipo abbreviato e ora', await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#schema g.nodo')).every(g => {
      const num = g.querySelector('.num').textContent, eti = g.querySelector('.eti').textContent;
      return num === g.dataset.ordine && /·\s\d{2}:\d{2}$/.test(eti) && eti.split(' · ')[0].length >= 3;
    });
  }));

  // --- selezione di un punto precedente dallo schema e flag "rifare"
  await page.click('#schema g.nodo[data-ordine="3"]');
  await page.click('#pp-rifare');
  s = await leggi();
  verifica('tocco sul nodo 3 nello schema + «Rifare» -> rifare=true sul punto 3 (gli altri no)',
    s.punti.find(p => p.ordine === 3).rifare === true && s.punti.filter(p => p.rifare).length === 1);
  verifica('il nodo 3 e\' marcato "rifare" nello schema', await page.evaluate(() => document.querySelector('#schema g.nodo[data-ordine="3"]').classList.contains('rifare')));

  // --- nota vocale (dispositivo finto di Chromium)
  const voceVisibile = await page.isVisible('#pp-voce');
  if (voceVisibile) {
    await page.click('#schema g.nodo[data-ordine="6"]');
    await page.click('#pp-voce');
    await page.waitForTimeout(1500);
    const testoStop = await page.textContent('#pp-voce');
    await page.click('#pp-voce');
    let salvata = false;
    try {
      await page.waitForFunction(() => { const s = JSON.parse(localStorage.getItem('rilievo_sessione')); const p = s.punti.find(p => p.ordine === 6); return p && typeof p.nota_vocale === 'string' && p.nota_vocale.indexOf('data:audio/') === 0; }, null, { timeout: 8000 });
      salvata = true;
    } catch (e) { salvata = false; }
    s = await leggi();
    const nv = s.punti.find(p => p.ordine === 6).nota_vocale || '';
    verifica('nota vocale: il tasto diventa «Stop» durante la registrazione', testoStop.trim() === 'Stop', testoStop);
    verifica('nota vocale registrata e salvata in base64 nel punto 6 (data:audio/...)', salvata, nv.slice(0, 40));
    verifica('nota vocale: l\'audio salvato e\' mostrato nel pannello', await page.isVisible('#voce-audio'));
  } else {
    verifica('nota vocale non disponibile in questo browser: tasto nascosto senza errori', (await page.textContent('#voce-stato')).includes('non disponibile'));
  }

  // --- ricarica della pagina: si riprende dove si era
  await page.reload();
  await page.waitForSelector('#schermata-rilievo', { state: 'visible' });
  s = await leggi();
  verifica('dopo la ricarica si riapre il rilievo con gli stessi 10 punti', uguali(s.punti.map(p => p.ordine), ordiniAttesi) && (await page.evaluate(() => document.querySelectorAll('#schema g.nodo').length)) === 10);
  verifica('dopo la ricarica il nome della chiesa e il contatore sono in testata',
    (await page.textContent('#h-chiesa')) === 'Chiesa del Purgatorio' && (await page.textContent('#h-punti')).startsWith('10'));
  await N();                                        // il prossimo principale riparte da 7
  s = await leggi();
  verifica('dopo la ricarica «Nuovo punto» continua la numerazione principale (7)', s.punti[s.punti.length - 1].ordine === 7);
  await D(); await N();
  s = await leggi();
  verifica('una terza deviazione usa 300', s.punti[s.punti.length - 1].ordine === 300 && s.punti[s.punti.length - 1].da_punto === 7);
  verifica('in deviazione «Torno al cammino» e\' attivo e lo stato lo dice', !(await page.isDisabled('#btn-torno')) && (await page.textContent('#stato-lane')).includes('Deviazione 3'));
  await T();

  // --- annulla l'ultimo punto (conferma inline) e la numerazione torna coerente
  await page.click('#btn-fine');
  await page.click('#btn-annulla-ultimo');
  verifica('«Annulla l\'ultimo punto» chiede conferma inline citando il punto 300', await page.isVisible('#conferma-annulla') && (await page.textContent('#conferma-annulla-testo')).includes('300'));
  await page.click('#btn-annulla-no');
  verifica('«No» non cancella', (await leggi()).punti.length === 12 && !(await page.isVisible('#conferma-annulla')));
  await page.click('#btn-annulla-ultimo'); await page.click('#btn-annulla-si');
  s = await leggi();
  verifica('«Sì, cancella» toglie il 300 e libera la terza deviazione', s.punti.length === 11 && s.punti[s.punti.length - 1].ordine === 7 && s.deviazioni === 2);
  await page.click('#btn-chiudi-fine');
  await D(); await N(); await T();
  s = await leggi();
  verifica('dopo l\'annullamento una nuova deviazione riusa il 300', s.punti[s.punti.length - 1].ordine === 300);
  // deviazione toccata mentre un'altra e' gia' aperta (con punti): si passa alla successiva
  await D(); await N(); await D(); await N(); await T();
  s = await leggi();
  verifica('«Deviazione» durante una deviazione con punti apre la successiva (400 poi 500, entrambe da 7)',
    uguali(s.punti.slice(-2).map(p => p.ordine), [400, 500]) && s.punti.slice(-2).every(p => p.da_punto === 7));
  piccoli = await testiPiccoli(page);
  verifica('tutti i testi visibili sono >= 16px (schermata con punti)', piccoli.length === 0, piccoli.join(', '));
  await page.screenshot({ path: path.join(TMP, 'contapunti.png') });

  // --- Fine: scarica il JSON
  await page.click('#btn-fine');
  await page.waitForSelector('#pannello-fine', { state: 'visible' });
  piccoli = await testiPiccoli(page);
  verifica('tutti i testi visibili sono >= 16px (pannello Fine)', piccoli.length === 0, piccoli.join(', '));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-scarica')]);
  const nomeFile = dl.suggestedFilename();
  verifica('download: nome rilievo-<slug>-<data>.json', /^rilievo-chiesa-del-purgatorio-\d{4}-\d{2}-\d{2}\.json$/.test(nomeFile), nomeFile);
  const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  verifica('download: struttura {chiesa, slug, inizio, fine, punti[], versione:1}',
    j.chiesa === 'Chiesa del Purgatorio' && j.slug === 'chiesa-del-purgatorio' && !isNaN(Date.parse(j.inizio)) && !isNaN(Date.parse(j.fine)) && Array.isArray(j.punti) && j.versione === 1);
  verifica('download: 14 punti con ordini 0,1,2,3,100,101,4,5,200,6,7,300,400,500', uguali(j.punti.map(p => p.ordine), ordiniAttesi.concat([7, 300, 400, 500])), j.punti.map(p => p.ordine).join(','));
  verifica('download: ogni punto ha {ordine,tipo,ora,bussola,nota,rifare}, da_punto solo nelle deviazioni',
    j.punti.every(p => ['ordine', 'tipo', 'ora', 'bussola', 'nota', 'rifare'].every(k => k in p) && ((p.ordine >= 100) === ('da_punto' in p))));
  verifica('download: la nota di testo e il flag rifare sono nel file', j.punti.find(p => p.ordine === 6).nota === 'Facciata, portale barocco' && j.punti.find(p => p.ordine === 3).rifare === true);
  if (voceVisibile) verifica('download: la nota vocale e\' nel file (nota_vocale base64)', typeof j.punti.find(p => p.ordine === 6).nota_vocale === 'string' && j.punti.find(p => p.ordine === 6).nota_vocale.startsWith('data:audio/'));
  verifica('download: il JSON e\' parsabile dalla pagina Abbina (campi minimi)', j.punti.every(p => typeof p.ordine === 'number' && typeof p.ora === 'string'));

  // --- Copia negli appunti
  await page.click('#btn-copia');
  await page.waitForTimeout(300);
  const appunti = await page.evaluate(async () => { try { return await navigator.clipboard.readText(); } catch (e) { return 'ERRORE ' + e.message; } });
  let copiaOk = false;
  try { copiaOk = JSON.parse(appunti).punti.length === 14; } catch (e) { copiaOk = false; }
  verifica('«Copia negli appunti» mette il JSON della sessione negli appunti', copiaOk, appunti.slice(0, 60));

  // --- Nuovo rilievo con conferma inline
  await page.click('#btn-nuovo-rilievo');
  verifica('«Nuovo rilievo» mostra la conferma inline (nessun window.confirm)', await page.isVisible('#conferma-azzera'));
  await page.click('#btn-azzera-no');
  verifica('«Annulla» non cancella nulla', !(await page.isVisible('#conferma-azzera')) && (await leggi()).punti.length === 14);
  await page.click('#btn-nuovo-rilievo');
  await page.click('#btn-azzera-si');
  await page.waitForSelector('#schermata-inizio', { state: 'visible' });
  verifica('«Sì, azzera» torna alla schermata iniziale, cancella la sessione e ricorda il nome della chiesa',
    (await page.evaluate(() => localStorage.getItem('rilievo_sessione'))) === null && (await page.inputValue('#chiesa')) === 'Chiesa del Purgatorio');
  piccoli = await testiPiccoli(page);
  verifica('tutti i testi visibili sono >= 16px (schermata iniziale)', piccoli.length === 0, piccoli.join(', '));

  // --- memoria piena: il salvataggio fallisce ma la pagina avvisa e non si rompe
  await page.fill('#chiesa', 'Prova memoria');
  await page.click('#btn-inizia');
  await page.waitForSelector('#schermata-rilievo', { state: 'visible' });
  await page.evaluate(() => { window.__setItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('QuotaExceededError (simulato)'); }; });
  await N();
  verifica('localStorage pieno: compare il banner rosso e il punto resta in pagina', await page.isVisible('#banner-errore') && (await page.evaluate(() => document.querySelectorAll('#schema g.nodo').length)) === 1);
  await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
  await N();
  verifica('quando il salvataggio torna a funzionare il banner sparisce', !(await page.isVisible('#banner-errore')) && (await leggi()).punti.length === 2);

  chiudiSorveglianza();
  await ctx.close();

  // --- browser senza MediaRecorder: solo nota di testo, nessun errore
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Rome' });
  await ctx2.addInitScript(() => { try { delete window.MediaRecorder; } catch (e) { window.MediaRecorder = undefined; } });
  const page2 = await ctx2.newPage();
  const chiudi2 = sorveglia(page2, 'Contapunti senza MediaRecorder');
  await page2.goto(url);
  await page2.fill('#chiesa', 'Prova senza microfono');
  await page2.click('#btn-inizia');
  await page2.click('#btn-nuovo');
  verifica('senza MediaRecorder: tasto «Nota vocale» nascosto, avviso testuale, nota di testo ancora disponibile',
    !(await page2.isVisible('#pp-voce')) && (await page2.textContent('#voce-stato')).includes('non disponibile') && (await page2.isVisible('#pp-nota')));
  chiudi2();
  await ctx2.close();

  // --- microfono negato dall'utente: messaggio, nessun errore
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Rome' });
  await ctx3.addInitScript(() => { navigator.mediaDevices.getUserMedia = function () { return Promise.reject(new DOMException('negato', 'NotAllowedError')); }; });
  const page3 = await ctx3.newPage();
  const chiudi3 = sorveglia(page3, 'Contapunti con microfono negato');
  await page3.goto(url);
  await page3.fill('#chiesa', 'Prova microfono negato');
  await page3.click('#btn-inizia');
  await page3.click('#btn-nuovo');
  await page3.click('#pp-voce');
  await page3.waitForFunction(() => document.getElementById('voce-stato').textContent.includes('negato'));
  verifica('microfono negato: messaggio «permesso negato», il tasto torna «Nota vocale»', (await page3.textContent('#pp-voce')).trim() === 'Nota vocale');
  chiudi3();
  await ctx3.close();
}

// ====================================================================
// ABBINA
// ====================================================================
async function testAbbina(browser) {
  console.log('\n== Abbina (abbina-sim1.html) ==');
  const atteso = JSON.parse(fs.readFileSync(path.join(FINTA, 'ATTESO.json'), 'utf8'));
  const sessione = JSON.parse(fs.readFileSync(path.join(FINTA, atteso.sessione_json), 'utf8'));
  const jpg = fs.readdirSync(FINTA).filter(f => /\.jpg$/i.test(f)).sort();
  // li passiamo in ordine mescolato: la pagina deve ordinarli per ora
  const mescolati = jpg.slice().sort((a, b) => (a.slice(-7) > b.slice(-7) ? -1 : 1)).map(f => path.join(FINTA, f));

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/Rome', acceptDownloads: true });
  const page = await ctx.newPage();
  const chiudiSorveglianza = sorveglia(page, 'Abbina');
  await page.goto('file://' + path.join(DIR, 'abbina-sim1.html'));

  // --- passo 1: sessione
  await page.setInputFiles('#input-json', path.join(FINTA, atteso.sessione_json));
  await page.waitForFunction(() => document.querySelectorAll('.punto').length === 10);
  verifica('passo 1: il JSON carica 10 punti e mostra chiesa e conteggio', (await page.textContent('#esito-json')).includes('Chiesa del Purgatorio') && (await page.textContent('#esito-json')).includes('10 punti'));
  verifica('passo 1: i punti sono elencati in ordine di tocco (0,1,2,3,100,101,4,5,200,6)',
    uguali(await page.evaluate(() => Array.from(document.querySelectorAll('.punto')).map(p => +p.dataset.ordine)), [0, 1, 2, 3, 100, 101, 4, 5, 200, 6]));
  verifica('passo 1: senza foto tutti i punti sono "manca lo scatto"', (await page.locator('.punto.mancante').count()) === 10);

  // --- passo 2: foto
  await page.setInputFiles('#input-foto', mescolati);
  await page.waitForFunction(n => document.querySelectorAll('.foto').length === n && !document.getElementById('btn-json').disabled, jpg.length);
  verifica(`passo 2: ${jpg.length} JPEG caricati, EXIF letto da tutti, byte order II e MM (nessuna etichetta «ora dal file»)`,
    (await page.locator('.foto').count()) === jpg.length && (await page.locator('.badge.file').count()) === 0 && (await page.textContent('#esito-foto')).includes(jpg.length + ' foto'));
  const st0 = await page.evaluate(() => window.abbinaStato());
  verifica('passo 2: l\'ora EXIF letta corrisponde a quella nel nome del file (tutte le foto)',
    st0.foto.every(f => { const m = /IMG_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(f.nome); const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]); return f.fonte === 'exif' && f.ora_exif === d.getTime(); }));
  verifica('passo 2: miniature generate (data:image/jpeg) e nessun originale nel DOM',
    await page.evaluate(() => { const im = Array.from(document.querySelectorAll('.foto img')); return im.length > 0 && im.every(i => i.src.startsWith('data:image/jpeg') && i.naturalWidth <= 400); }));
  verifica('passo 2: le foto nella colonna sinistra sono in ordine di ora',
    await page.evaluate(() => { const t = Array.from(document.querySelectorAll('#lista-abbinate .foto .ora b, #lista-senza .foto .ora b')).map(b => b.textContent); return t.length > 1 && t.every((x, i) => i === 0 || x >= t[i - 1]); }));

  // --- suggerimento automatico: scarto che allinea la prima foto al primo punto
  const primaFoto = st0.foto.reduce((m, f) => (f.ora_exif < m.ora_exif ? f : m), st0.foto[0]);
  const sugAtteso = Math.round((Date.parse(sessione.punti[0].ora) - primaFoto.ora_exif) / 1000);
  const sugTesto = await page.textContent('#suggerimento');
  verifica(`suggerimento automatico = tocco(0) − prima foto = ${sugAtteso > 0 ? '+' : ''}${sugAtteso} s, proposto e non applicato (scarto resta 0)`,
    sugTesto.includes((sugAtteso > 0 ? '+' : '') + sugAtteso + ' s') && sugTesto.includes(primaFoto.nome) && (await page.inputValue('#scarto')) === '0');
  verifica('con scarto 0 (orologi disallineati) il ripiego propone la foto pre-inizio al punto 0 con «proposta per ordine»',
    (await page.locator('.punto[data-ordine="0"] .badge.ripiego').count()) === 1);
  verifica('«Ricava dal primo abbinamento» e\' disabilitato finche\' non si abbina a mano il primo punto', await page.isDisabled('#btn-ricava'));

  // --- trascinamento della foto giusta sul primo punto + Ricava
  await page.locator(`.foto[data-nome="${atteso.prima_foto_punto_0}"]`).dragTo(page.locator('.punto[data-ordine="0"]'));
  verifica('drag&drop foto -> punto 0: messaggio di conferma e tasto «Ricava» attivo',
    (await page.textContent('#messaggio')).includes('assegnata al punto 0') && !(await page.isDisabled('#btn-ricava')) && (await page.isVisible('#hint-ricava')));
  await page.click('#btn-ricava');
  verifica(`«Ricava dal primo abbinamento» imposta lo scarto a ${atteso.scarto_sec_atteso} s`, (await page.inputValue('#scarto')) === String(atteso.scarto_sec_atteso), await page.inputValue('#scarto'));
  const riep = await page.textContent('#riepilogo');
  verifica('riepilogo: 10 punti · 13 foto · 9 abbinati · 1 senza punto · 1 manca lo scatto · scarto −165 s',
    /10 punti/.test(riep) && new RegExp(jpg.length + ' foto').test(riep) && /9 abbinati/.test(riep) && /1 senza punto/.test(riep) && /1 manca lo scatto/.test(riep) && riep.includes(atteso.scarto_sec_atteso + ' s'), riep);

  // --- stato prima di accettare
  verifica('punto 101 evidenziato in giallo con «manca lo scatto»',
    (await page.locator('.punto[data-ordine="101"].mancante').count()) === 1 && (await page.textContent('.punto[data-ordine="101"]')).includes('manca lo scatto'));
  verifica('la foto scattata prima dell\'inizio e\' nella colonna «Senza punto»',
    (await page.locator(`#lista-senza .foto[data-nome="${atteso.senza_punto[0]}"]`).count()) === 1 && (await page.textContent('#conta-senza')) === '(1)');
  verifica('raffica del punto 2: 3 scatti, scelto l\'ultimo; raffica del punto 100: 2 scatti, scelto l\'ultimo',
    (await page.locator('.punto[data-ordine="2"] .scatto').count()) === 3 &&
    (await page.locator('.punto[data-ordine="2"] .scatto.scelto').getAttribute('data-nome')) === atteso.scene.find(s => s.ordine === 2).file_originale &&
    (await page.locator('.punto[data-ordine="100"] .scatto').count()) === 2 &&
    (await page.locator('.punto[data-ordine="100"] .scatto.scelto').getAttribute('data-nome')) === atteso.scene.find(s => s.ordine === 100).file_originale &&
    (await page.textContent('.punto[data-ordine="2"]')).includes('raffica di 3'));
  verifica('prima di «Accetta tutto» 8 punti sono ancora «proposta» e il punto 0 e\' «confermato» (abbinato a mano)',
    (await page.locator('.punto.proposta').count()) === 8 && (await page.locator('.punto[data-ordine="0"].confermato').count()) === 1);

  // --- scelta in raffica modificabile con un clic
  const primaDellaRaffica = atteso.scene.find(s => s.ordine === 2).raffica[0];
  await page.click(`.punto[data-ordine="2"] .scatto[data-nome="${primaDellaRaffica}"]`);
  verifica('clic su un altro scatto della raffica: diventa lui lo scelto', (await page.locator('.punto[data-ordine="2"] .scatto.scelto').getAttribute('data-nome')) === primaDellaRaffica);
  await page.click(`.punto[data-ordine="2"] .scatto[data-nome="${atteso.scene.find(s => s.ordine === 2).file_originale}"]`);

  // --- Accetta tutto
  await page.click('#btn-accetta');
  verifica('«Accetta tutto»: 9 punti confermati, 0 proposte, 101 resta mancante',
    (await page.locator('.punto.confermato').count()) === 9 && (await page.locator('.punto.proposta').count()) === 0 && (await page.locator('.punto[data-ordine="101"].mancante').count()) === 1 && (await page.isDisabled('#btn-accetta')));

  // --- export JSON
  const [dlJson] = await Promise.all([page.waitForEvent('download'), page.click('#btn-json')]);
  verifica('export: il file si chiama abbinamento.json', dlJson.suggestedFilename() === 'abbinamento.json');
  const abb = JSON.parse(fs.readFileSync(await dlJson.path(), 'utf8'));
  verifica('export JSON: chiesa, slug, scarto_sec corretti', abb.chiesa === atteso.chiesa && abb.slug === atteso.slug && abb.scarto_sec === atteso.scarto_sec_atteso);
  verifica('export JSON: scene con i campi {ordine,tipo,file_originale,nuovo_nome,ora_tocco,ora_scatto,nota}',
    Array.isArray(abb.scene) && abb.scene.length === 10 && abb.scene.every(s => ['ordine', 'tipo', 'file_originale', 'nuovo_nome', 'ora_tocco', 'ora_scatto', 'nota'].every(k => k in s)));
  const confronto = atteso.scene.map(a => {
    const s = abb.scene.find(x => x.ordine === a.ordine);
    const ok = s && s.tipo === a.tipo && s.file_originale === a.file_originale && s.nuovo_nome === a.nuovo_nome && uguali(s.raffica, a.raffica);
    return ok ? null : `punto ${a.ordine}: atteso ${a.file_originale} / ${a.nuovo_nome}, trovato ${s ? s.file_originale + ' / ' + s.nuovo_nome : 'nulla'}`;
  }).filter(Boolean);
  verifica('export JSON = ATTESO.json: tutti i punti con la foto giusta, raffiche risolte sull\'ultimo scatto', confronto.length === 0, confronto.join('; '));
  verifica('export JSON: 101 e\' segnalato mancante (file_originale null, stato "mancante")', abb.scene.find(s => s.ordine === 101).file_originale === null && abb.scene.find(s => s.ordine === 101).stato === 'mancante' && uguali(atteso.mancanti, [101]));
  verifica('export JSON: la foto pre-inizio e\' in senza_punto', uguali(abb.senza_punto, atteso.senza_punto));
  verifica('export JSON: ora_tocco e ora_scatto sono ISO e ora_scatto (corretta) cade entro 2 minuti dopo il tocco',
    abb.scene.filter(s => s.file_originale).every(s => { const d = (Date.parse(s.ora_scatto) - Date.parse(s.ora_tocco)) / 1000; return s.ora_tocco === sessione.punti.find(p => p.ordine === s.ordine).ora && d >= 0 && d <= 120; }));
  verifica('export JSON: le note dei punti passano nelle scene', abb.scene.find(s => s.ordine === 0).nota === sessione.punti.find(p => p.ordine === 0).nota);

  // --- export CSV / BAT / SH
  const [dlCsv] = await Promise.all([page.waitForEvent('download'), page.click('#btn-csv')]);
  const csv = fs.readFileSync(await dlCsv.path(), 'utf8');
  const righeCsv = csv.trim().split(/\r?\n/);
  const atteseCsv = atteso.scene.filter(s => s.file_originale).map(s => s.file_originale + ';' + s.nuovo_nome);
  verifica('export rinomina.csv: intestazione e 9 righe file_originale;nuovo_nome come ATTESO', dlCsv.suggestedFilename() === 'rinomina.csv' && righeCsv[0] === 'file_originale;nuovo_nome' && uguali(righeCsv.slice(1).sort(), atteseCsv.slice().sort()), righeCsv.join(' | '));
  const [dlBat] = await Promise.all([page.waitForEvent('download'), page.click('#btn-bat')]);
  const bat = fs.readFileSync(await dlBat.path(), 'utf8');
  verifica('export rinomina.bat: 9 comandi ren, righe CRLF, cd nella propria cartella',
    dlBat.suggestedFilename() === 'rinomina.bat' && atteseCsv.every(r => { const [o, n] = r.split(';'); return bat.includes(`ren "${o}" "${n}"`); }) && /\r\n/.test(bat) && bat.includes('cd /d "%~dp0"') && (bat.match(/ ren /g) || []).length === 9);
  const [dlSh] = await Promise.all([page.waitForEvent('download'), page.click('#btn-sh')]);
  const sh = fs.readFileSync(await dlSh.path(), 'utf8');
  verifica('export rinomina.sh: shebang e 9 comandi mv -n',
    dlSh.suggestedFilename() === 'rinomina.sh' && sh.startsWith('#!/bin/sh') && atteseCsv.every(r => { const [o, n] = r.split(';'); return sh.includes(`mv -n "${o}" "${n}"`); }) && (sh.match(/mv -n/g) || []).length === 9);

  // --- flusso a tocco: clic sulla foto, poi clic sul punto; poi rimozione via bersaglio «Senza punto»
  await page.click(`#lista-senza .foto[data-nome="${atteso.senza_punto[0]}"]`);
  verifica('tocco: clic sulla foto la seleziona e il messaggio guida al punto', (await page.locator('.foto.selezionata').count()) === 1 && (await page.textContent('#messaggio')).includes('clicca il punto'));
  await page.click('.punto[data-ordine="101"] .ordine');
  verifica('tocco: clic sul punto 101 assegna la foto, 101 non e\' piu\' mancante',
    (await page.locator('.punto[data-ordine="101"].mancante').count()) === 0 && (await page.locator(`.punto[data-ordine="101"] .scatto[data-nome="${atteso.senza_punto[0]}"]`).count()) === 1 && (await page.textContent('#conta-senza')) === '(0)');
  await page.locator(`.foto[data-nome="${atteso.senza_punto[0]}"]`).dragTo(page.locator('#bersaglio-senza'));
  verifica('drag sul bersaglio «Senza punto»: la foto torna senza punto e 101 torna mancante',
    (await page.locator('.punto[data-ordine="101"].mancante').count()) === 1 && (await page.locator(`#lista-senza .foto[data-nome="${atteso.senza_punto[0]}"]`).count()) === 1);

  // --- scarto modificabile a mano: con 0 le proposte non confermate si spostano, quelle confermate no
  await page.fill('#scarto', '0');
  await page.dispatchEvent('#scarto', 'change');
  const stScarto0 = await page.evaluate(() => window.abbinaStato());
  verifica('scarto scritto a mano (0): gli abbinamenti confermati restano fissi', stScarto0.scarto === 0 && stScarto0.scene.filter(s => s.file_originale).length === 9 && stScarto0.scene.every(s => s.ordine === 101 || s.file_originale === atteso.scene.find(a => a.ordine === s.ordine).file_originale));
  await page.fill('#scarto', String(atteso.scarto_sec_atteso));
  await page.dispatchEvent('#scarto', 'change');

  // --- JPEG senza EXIF: etichetta «ora dal file»
  const senzaExifB64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 64, 32); return c.toDataURL('image/jpeg', 0.8).split(',')[1]; });
  const fileSenzaExif = path.join(TMP, 'senza-exif.jpg');
  fs.writeFileSync(fileSenzaExif, Buffer.from(senzaExifB64, 'base64'));
  await page.setInputFiles('#input-foto', fileSenzaExif);
  await page.waitForFunction(n => document.querySelectorAll('.foto').length === n, jpg.length + 1);
  verifica('JPEG senza EXIF: caricato con etichetta «ora dal file» (lastModified) senza errori',
    (await page.locator('.foto[data-nome="senza-exif.jpg"] .badge.file').count()) === 1 && (await page.textContent('#esito-foto')).includes('1 senza EXIF'));
  // JPEG con il solo DateTime (0x0132) in IFD0 e nessun Exif IFD: il parser deve ripiegare su quello
  await page.setInputFiles('#input-foto', path.join(FINTA, 'extra', 'solo-ifd0-datetime.jpg'));
  await page.waitForFunction(n => document.querySelectorAll('.foto').length === n, jpg.length + 2);
  const attesoIfd0 = fs.readFileSync(path.join(FINTA, 'extra', 'solo-ifd0-datetime.txt'), 'utf8').trim();
  const stIfd0 = (await page.evaluate(() => window.abbinaStato())).foto.find(f => f.nome === 'solo-ifd0-datetime.jpg');
  const m0 = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(attesoIfd0);
  verifica('JPEG con solo DateTime in IFD0 (senza Exif IFD): ora letta dal ripiego 0x0132',
    stIfd0 && stIfd0.fonte === 'exif' && stIfd0.ora_exif === new Date(+m0[1], +m0[2] - 1, +m0[3], +m0[4], +m0[5], +m0[6]).getTime(), JSON.stringify(stIfd0));
  verifica('file non JPEG: rifiutati con messaggio', await (async () => { await page.setInputFiles('#input-foto', path.join(FINTA, 'ATTESO.json')); return (await page.textContent('#messaggio')).includes('Nessun JPEG'); })());

  await page.screenshot({ path: path.join(TMP, 'abbina.png') });
  chiudiSorveglianza();
  await ctx.close();
}

// ====================================================================
(async () => {
  if (!fs.existsSync(path.join(FINTA, 'ATTESO.json'))) {
    console.error('Manca ./finta/ATTESO.json: esegui prima  python3 genera_sessione_finta.py');
    process.exit(2);
  }
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    await testContapunti(browser);
    await testAbbina(browser);
  } catch (e) {
    verifica('esecuzione completa senza eccezioni', false, e.stack || e.message);
  } finally {
    await browser.close();
  }
  const falliti = esiti.filter(e => !e.ok);
  console.log(`\nRisultato: ${esiti.length - falliti.length}/${esiti.length} controlli passati` + (falliti.length ? ` — FALLITI ${falliti.length}` : ''));
  console.log('Screenshot in ' + TMP);
  process.exit(falliti.length ? 1 : 0);
})();
