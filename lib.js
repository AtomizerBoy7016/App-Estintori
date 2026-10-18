/* Logica dell'app: sigle estintori, scadenze, importazione fogli.
   Nessuna dipendenza dal browser: si può provare anche con Node.
   (Le periodicità di legge – UNI 9994-1 – vanno verificate dal manutentore.) */
(function (root) {
  'use strict';

  // ---------- Sigle estintori ----------
  // P6 = polvere 6 kg · K2/K5 = CO2 2/5 kg · Lt6 = schiumogeno 6 L · aut. = automatico · carr. = carrellato
  const TIPI = { P: ['Polvere', 'kg'], K: ['CO2', 'kg'], LT: ['Schiumogeno', 'L'] };
  // dalla più lunga alla più corta: permette di leggere "1P61K2" come 1 P6 + 1 K2
  const CAP = ['100', '50', '30', '25', '12', '10', '9', '6', '5', '4', '3', '2', '1'];
  const FLAG = '(?:aut\\w*\\.?|carr\\w*\\.?)';
  const tokenRe = () => new RegExp(
    '(?:(\\d+)\\s*)?(?:(' + FLAG + ')\\s*)?(LT|P|K)\\s*(' + CAP.join('|') + ')(?:\\s*(' + FLAG + '))?', 'gi');

  function descrizione(tipo, cap, unita, aut, carr) {
    return TIPI[tipo][0] + ' ' + cap + ' ' + unita + (carr ? ' carrellato' : '') + (aut ? ' automatico' : '');
  }

  function parseTipo(testo) {
    if (testo == null) return { lista: [], errori: ['tipo estintori vuoto'] };
    const lista = [], errori = [];
    const segmenti = String(testo).split(/[\n/;,+]/).filter(s => s.trim());
    for (const seg of segmenti) {
      const trovati = [...seg.matchAll(tokenRe())];
      let residuo = seg;
      for (const m of [...trovati].reverse()) {
        residuo = residuo.slice(0, m.index) + ' ' + residuo.slice(m.index + m[0].length);
      }
      if (!trovati.length || /[A-Za-z0-9]/.test(residuo)) errori.push("sigla non riconosciuta: '" + seg.trim() + "'");
      for (const m of trovati) {
        const flag = ((m[2] || '') + ' ' + (m[5] || '')).toLowerCase();
        const aut = flag.includes('aut'), carr = flag.includes('carr');
        const tipo = m[3].toUpperCase(), capacita = parseInt(m[4], 10), unita = TIPI[tipo][1];
        lista.push({
          tipo, capacita, unita, quantita: m[1] ? parseInt(m[1], 10) : 1,
          automatico: aut, carrellato: carr, descrizione: descrizione(tipo, capacita, unita, aut, carr),
        });
      }
    }
    return { lista, errori };
  }

  const totale = lista => lista.reduce((s, e) => s + e.quantita, 0);

  function sigla(e) {
    const cod = e.tipo === 'LT' ? 'Lt' : e.tipo;
    return e.quantita + '×' + cod + e.capacita + (e.carrellato ? ' carr.' : '') + (e.automatico ? ' aut.' : '');
  }

  // ---------- Date e scadenze ----------
  const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto',
    'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const MESI_BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
  function oggiIso() { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function addDays(isoDate, n) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }
  function fineMese(y, m) { return iso(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate()); }

  function primaScadenzaDal(mesi, y, m) {
    const ms = [...mesi].sort((a, b) => a - b);
    for (const anno of [y, y + 1]) for (const mm of ms) if (anno * 100 + mm >= y * 100 + m) return fineMese(anno, mm);
  }
  function scadenzaIniziale(mesi, oggi) {
    const [y, m] = (oggi || oggiIso()).split('-').map(Number);
    return primaScadenzaDal(mesi, y, m);
  }
  /* Dopo un intervento il cliente torna in scadenza al successivo mese del ciclo
     (si parte da 3 mesi dopo: gennaio -> luglio; fatto in anticipo a dicembre -> già gennaio coperto). */
  function scadenzaDopoIntervento(mesi, dataIso) {
    let [y, m] = dataIso.split('-').map(Number);
    m += 3; y += Math.floor((m - 1) / 12); m = (m - 1) % 12 + 1;
    return primaScadenzaDal(mesi, y, m);
  }
  function statoScadenza(scad, oggi, giorni) {
    oggi = oggi || oggiIso();
    if (scad < oggi) return 'scaduto';
    const inizio = scad.slice(0, 8) + '01';
    if (inizio <= oggi) return 'corso';
    if (inizio <= addDays(oggi, giorni == null ? 30 : giorni)) return 'scadenza';
    return 'futuro';
  }
  const etichettaScadenza = scad => MESI[parseInt(scad.slice(5, 7), 10) - 1] + ' ' + scad.slice(0, 4);
  const etichettaCiclo = mesi => mesi.map(m => MESI_BREVI[m - 1]).join(' / ');

  // ---------- Importazione fogli (righe = array di array di testo) ----------
  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();

  function mesiDalTitolo(rows) {
    for (const r of rows.slice(0, 3)) {
      const t = r.join(' ').toLowerCase();
      const trovati = [];
      MESI.forEach((nome, i) => { if (new RegExp('\\b' + nome.toLowerCase()).test(t)) trovati.push(i + 1); });
      if (trovati.length) return trovati;
    }
    return [];
  }
  function pulisciLuogo(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
      .map(p => ['di', 'del', 'della'].includes(p.toLowerCase()) ? p.toLowerCase()
        : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  }
  const righeCella = v => String(v == null ? '' : v).split(/\r?\n/).map(x => x.trim()).filter(Boolean);

  function analizzaRighe(rows, mesiForzati) {
    const mesi = (mesiForzati && mesiForzati.length) ? mesiForzati : mesiDalTitolo(rows);
    const inizio = rows.findIndex(r => righeCella(r[0])[0] && righeCella(r[0])[0].toLowerCase().includes('cliente'));
    if (inizio < 0) throw new Error("Intestazione 'Nome Cliente' non trovata nel file.");
    const clienti = [], avvisi = [];
    rows.slice(inizio + 1).forEach((r, k) => {
      const n = inizio + 2 + k;
      const lines = righeCella(r[0]);
      if (!lines.length) return;
      const nome = lines[0];
      let indirizzo = null; const note = [];
      for (const extra of lines.slice(1)) {
        if (extra.startsWith('(') && extra.endsWith(')')) note.push(extra.slice(1, -1));
        else if (indirizzo === null) indirizzo = extra;
        else note.push(extra);
      }
      const qd = parseInt(String(r[1] == null ? '' : r[1]).trim(), 10);
      const qtaDichiarata = isNaN(qd) ? null : qd;
      const { lista, errori } = parseTipo(righeCella(r[2]).join('\n'));
      const comune = pulisciLuogo(r[3]) || null;
      errori.forEach(e => avvisi.push('Riga ' + n + ' – ' + nome + ': ' + e));
      if (qtaDichiarata !== null && !errori.length && totale(lista) !== qtaDichiarata)
        avvisi.push('Riga ' + n + ' – ' + nome + ': quantità ' + qtaDichiarata + ' ma le sigle sommano ' + totale(lista));
      if (!indirizzo) avvisi.push('Riga ' + n + ' – ' + nome + ': indirizzo mancante');
      if (!comune) avvisi.push('Riga ' + n + ' – ' + nome + ': luogo mancante');
      clienti.push({ nome, indirizzo, indirizzoNote: note.join('; ') || null, comune, estintori: lista,
        qtaDichiarata, problemi: errori.length > 0 });
    });
    return { mesi, clienti, avvisi };
  }

  function nuovoId() {
    return (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID()
      : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function nuovoCliente(d) {
    const mesi = d.ciclo;
    return {
      id: nuovoId(), nome: d.nome, indirizzo: d.indirizzo || null, indirizzoNote: d.indirizzoNote || null,
      comune: d.comune || null, provincia: d.provincia || null, referente: d.referente || null,
      telefono: d.telefono || null, email: d.email || null, note: d.note || null, ciclo: mesi,
      ultima: null, scadenza: d.scadenza || scadenzaIniziale(mesi), attivo: true,
      estintori: d.estintori || [], interventi: [], creato: new Date().toISOString(),
    };
  }
  const chiaveCliente = c => norm(c.nome) + '|' + norm(c.indirizzo);

  /* Clienti nuovi da un'analisi; salta chi esiste già (stesso nome+indirizzo) e chi ha sigle illeggibili. */
  function clientiDaImportare(esistenti, analisi, mesi) {
    const presenti = new Set(esistenti.map(chiaveCliente));
    const res = { nuovi: [], saltatiEsistenti: [], saltatiErrori: [] };
    for (const c of analisi.clienti) {
      if (c.problemi) { res.saltatiErrori.push(c.nome); continue; }
      const nuovo = nuovoCliente({ nome: c.nome, indirizzo: c.indirizzo, indirizzoNote: c.indirizzoNote,
        comune: c.comune, ciclo: mesi, estintori: c.estintori });
      if (presenti.has(chiaveCliente(nuovo))) { res.saltatiEsistenti.push(c.nome); continue; }
      presenti.add(chiaveCliente(nuovo));
      res.nuovi.push(nuovo);
    }
    return res;
  }

  const API = { TIPI, parseTipo, totale, sigla, descrizione, MESI, MESI_BREVI, oggiIso, addDays, fineMese,
    scadenzaIniziale, scadenzaDopoIntervento, statoScadenza, etichettaScadenza, etichettaCiclo,
    mesiDalTitolo, analizzaRighe, nuovoCliente, clientiDaImportare, chiaveCliente, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Lib = API;
})(typeof self !== 'undefined' ? self : this);
