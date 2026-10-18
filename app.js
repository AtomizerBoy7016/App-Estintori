/* Interfaccia dell'app. Tutti i dati restano sul telefono (IndexedDB). */
(function () {
  'use strict';
  const L = self.Lib, A = self.Archivio;

  // ---------- stato ----------
  const S = {
    clienti: [], tab: 'fare', giorni: 90, comuni: new Set(), cerca: '', raggruppa: true, cercaClienti: '',
    importFile: null, importBackup: null, ultimoBackup: null, installEvent: null, persist: null,
  };
  const $ = s => document.querySelector(s);
  const app = $('#app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = {
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    nav: '<svg viewBox="0 0 24 24"><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>',
    tel: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    cerca: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    persona: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/></svg>',
  };
  const pref = {
    leggi() { try { const p = JSON.parse(localStorage.getItem('prefs') || '{}'); if (p.giorni) S.giorni = p.giorni; if (p.raggruppa != null) S.raggruppa = p.raggruppa; if (p.tab) S.tab = p.tab; } catch (e) { /* ok */ } },
    scrivi() { try { localStorage.setItem('prefs', JSON.stringify({ giorni: S.giorni, raggruppa: S.raggruppa, tab: S.tab })); } catch (e) { /* ok */ } },
  };

  // ---------- utilità ----------
  const oggi = () => L.oggiIso();
  const attivi = () => S.clienti.filter(c => c.attivo !== false);
  const nEst = c => L.totale(c.estintori || []);
  const stato = c => L.statoScadenza(c.scadenza, oggi(), S.giorni);
  const testoSigle = ests => ests.map(e => e.quantita + (e.carrellato ? ' carr.' : '') + (e.automatico ? ' aut.' : '') + ' ' + (e.tipo === 'LT' ? 'Lt' : e.tipo) + e.capacita).join(', ');
  const luogo = c => [c.indirizzo, c.comune].filter(Boolean).join(', ');
  const mapsUrl = c => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(c.indirizzo ? luogo(c) : [c.nome, c.comune].filter(Boolean).join(', '));
  const dataIt = iso => iso ? iso.split('-').reverse().join('/') : '';
  const badgeTesto = (c, st) => st === 'scaduto' ? 'Scaduto' : st === 'corso' ? 'Questo mese' : L.MESI_BREVI[+c.scadenza.slice(5, 7) - 1] + ' ' + c.scadenza.slice(0, 4);
  const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'it', { sensitivity: 'base' });

  function toast(msg, azione, fn) {
    const t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (azione ? '<button>' + esc(azione) + '</button>' : '');
    t.hidden = false;
    clearTimeout(toast._t);
    if (azione) t.querySelector('button').onclick = () => { t.hidden = true; fn(); };
    toast._t = setTimeout(() => { t.hidden = true; }, azione ? 7000 : 3200);
  }

  async function salvaCliente(c) {
    await A.salva(c);
    const i = S.clienti.findIndex(x => x.id === c.id);
    if (i >= 0) S.clienti[i] = c; else S.clienti.push(c);
  }

  // ---------- schermata: DA FARE ----------
  function listaFare() {
    const q = L.norm(S.cerca);
    return attivi().filter(c => stato(c) !== 'futuro')
      .filter(c => !S.comuni.size || S.comuni.has(c.comune || ''))
      .filter(c => !q || L.norm(c.nome + ' ' + (c.indirizzo || '') + ' ' + (c.comune || '')).includes(q))
      .sort((a, b) => cmp(a.scadenza, b.scadenza) || cmp(a.comune, b.comune) || cmp(a.nome, b.nome));
  }
  function card(c) {
    const st = stato(c);
    const sigle = (c.estintori || []).map(e => '<span>' + esc(L.sigla(e)) + '</span>').join('');
    return '<article class="card ' + st + '" data-act="apri" data-id="' + esc(c.id) + '">' +
      '<div class="testa"><div><h3>' + esc(c.nome) + '</h3>' +
      (c.indirizzo || c.comune ? '<p class="ind">' + ic.pin + '<span>' + esc(luogo(c)) + (c.indirizzoNote ? ' <em>(' + esc(c.indirizzoNote) + ')</em>' : '') + '</span></p>' : '') +
      '</div><span class="badge ' + st + '">' + esc(badgeTesto(c, st)) + '</span></div>' +
      '<div class="sigle">' + sigle + '</div>' +
      '<div class="azioni">' +
      '<a class="btn" href="' + esc(mapsUrl(c)) + '" target="_blank" rel="noopener" data-stop="1">' + ic.nav + 'Naviga</a>' +
      (c.telefono ? '<a class="btn" href="tel:' + esc(c.telefono.replace(/\s+/g, '')) + '" data-stop="1">' + ic.tel + 'Chiama</a>' : '') +
      '<button class="btn ok" data-act="fatto" data-id="' + esc(c.id) + '">' + ic.ok + 'Fatto</button></div></article>';
  }
  function renderListaFare() {
    const el = $('#lista'); if (!el) return;
    const lista = listaFare();
    $('#st-scaduti').textContent = lista.filter(c => stato(c) === 'scaduto').length;
    $('#st-clienti').textContent = lista.length;
    $('#st-estintori').textContent = lista.reduce((s, c) => s + nEst(c), 0);
    if (!lista.length) {
      el.innerHTML = '<div class="vuoto"><b>' + (attivi().length ? 'Niente da fare' : 'Nessun cliente') + '</b>' +
        (attivi().length ? 'Nessuna scadenza entro ' + S.giorni + ' giorni con questi filtri.' : 'Vai su «Dati» per importare i tuoi fogli oppure aggiungi un cliente con il pulsante +.') + '</div>';
      return;
    }
    if (!S.raggruppa) { el.innerHTML = lista.map(card).join(''); return; }
    const gruppi = new Map();
    lista.forEach(c => { const k = c.comune || 'Senza luogo'; if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(c); });
    el.innerHTML = [...gruppi.keys()].sort(cmp).map(k => {
      const g = gruppi.get(k);
      return '<div class="gruppo"><h2>' + esc(k) + '</h2><span>' + g.length + ' clienti · ' + g.reduce((s, c) => s + nEst(c), 0) + ' estintori</span></div>' + g.map(card).join('');
    }).join('');
  }
  function renderFare() {
    const comuni = [...new Set(attivi().filter(c => stato(c) !== 'futuro').map(c => c.comune || ''))].sort(cmp);
    const vecchio = !S.ultimoBackup || (Date.now() - new Date(S.ultimoBackup)) > 14 * 864e5;
    app.innerHTML =
      (attivi().length && vecchio ? '<div class="avviso">' + (S.ultimoBackup ? 'L\'ultima copia di sicurezza risale a più di 2 settimane fa.' : 'Non hai ancora fatto una copia di sicurezza dei dati.') +
        '<br><button class="btn" data-act="backup">Salva copia su Drive</button></div>' : '') +
      '<div class="seg" id="seg">' + [30, 60, 90, 180].map(g => '<button data-giorni="' + g + '" class="' + (g === S.giorni ? 'on' : '') + '">' + g + ' giorni</button>').join('') + '</div>' +
      '<div class="stat"><div class="rosso"><b id="st-scaduti">0</b><span>Scaduti</span></div><div><b id="st-clienti">0</b><span>Clienti</span></div><div><b id="st-estintori">0</b><span>Estintori</span></div></div>' +
      '<div class="cerca">' + ic.cerca + '<input id="cerca" type="search" placeholder="Cerca cliente o via" value="' + esc(S.cerca) + '"></div>' +
      (comuni.length > 1 ? '<div class="chips" id="chips"><button class="chip ' + (!S.comuni.size ? 'on' : '') + '" data-comune="">Tutti</button>' +
        comuni.map(k => '<button class="chip ' + (S.comuni.has(k) ? 'on' : '') + '" data-comune="' + esc(k) + '">' + esc(k || 'Senza luogo') + '</button>').join('') + '</div>' : '') +
      '<div class="riga" style="justify-content:flex-end;margin-bottom:-4px"><button class="chip ' + (S.raggruppa ? 'on' : '') + '" data-act="raggruppa">Raggruppa per comune</button></div>' +
      '<div id="lista"></div>';
    renderListaFare();
  }

  // ---------- schermata: CLIENTI ----------
  function renderListaClienti() {
    const el = $('#lista'); if (!el) return;
    const q = L.norm(S.cercaClienti);
    const lista = attivi().filter(c => !q || L.norm(c.nome + ' ' + (c.indirizzo || '') + ' ' + (c.comune || '')).includes(q)).sort((a, b) => cmp(a.nome, b.nome));
    $('#sottotitolo').textContent = lista.length + ' clienti · ' + lista.reduce((s, c) => s + nEst(c), 0) + ' estintori';
    el.innerHTML = lista.length ? lista.map(c => {
      const st = stato(c);
      return '<article class="card ' + st + '" data-act="apri" data-id="' + esc(c.id) + '"><div class="testa"><div><h3>' + esc(c.nome) + '</h3><p class="ind">' + ic.pin + '<span>' + esc(luogo(c) || '—') + '</span></p></div>' +
        '<span class="badge ' + st + '">' + esc(badgeTesto(c, st)) + '</span></div><div class="sigle">' + (c.estintori || []).map(e => '<span>' + esc(L.sigla(e)) + '</span>').join('') + '</div></article>';
    }).join('') : '<div class="vuoto"><b>Nessun risultato</b>Prova con un altro nome o aggiungi un nuovo cliente.</div>';
  }
  function renderClienti() {
    app.innerHTML = '<div class="cerca">' + ic.cerca + '<input id="cerca-c" type="search" placeholder="Cerca per nome, via o comune" value="' + esc(S.cercaClienti) + '"></div><div id="lista"></div>';
    renderListaClienti();
  }

  // ---------- schermata: DATI ----------
  function fa(iso) {
    if (!iso) return 'mai';
    const g = Math.floor((Date.now() - new Date(iso)) / 864e5);
    return g <= 0 ? 'oggi' : g === 1 ? 'ieri' : g + ' giorni fa';
  }
  function renderDati() {
    const imp = S.importFile, bk = S.importBackup;
    let h = '';
    if (imp) {
      const a = imp.analisi, n = a.clienti.filter(c => !c.problemi).length;
      const sel = m => '<option value="">—</option>' + L.MESI.map((x, i) => '<option value="' + (i + 1) + '"' + (m === i + 1 ? ' selected' : '') + '>' + x + '</option>').join('');
      h += '<div class="blocco"><h2>Anteprima: ' + esc(imp.nome) + '</h2><p>' + a.clienti.length + ' clienti, ' + a.clienti.reduce((s, c) => s + L.totale(c.estintori), 0) + ' estintori.</p>' +
        (a.mesi.length ? '<div class="avviso ok">Ciclo rilevato: <b>' + esc(L.etichettaCiclo(a.mesi)) + '</b></div>' :
          '<div class="avviso">Mesi del ciclo non trovati nel titolo. Scegli i due mesi:</div><div class="due"><label class="campo"><span>Primo mese</span><select id="imp-m1">' + sel(0) + '</select></label><label class="campo"><span>Secondo mese</span><select id="imp-m2">' + sel(0) + '</select></label></div>') +
        (a.avvisi.length ? '<details class="avvisi"><summary>' + a.avvisi.length + ' avvisi</summary><ul>' + a.avvisi.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></details>' : '') +
        '<button class="btn primario largo" data-act="conferma-import">Importa ' + n + ' clienti</button><button class="btn largo" data-act="annulla-import">Annulla</button></div>';
    }
    if (bk) {
      h += '<div class="blocco"><h2>Copia di sicurezza trovata</h2><p>' + bk.clienti.length + ' clienti, salvata il ' + esc(dataIt((bk.esportato || '').slice(0, 10))) + '.</p>' +
        '<button class="btn primario largo" data-act="bk-sostituisci">Sostituisci i dati attuali</button>' +
        '<button class="btn largo" data-act="bk-unisci">Aggiungi solo i clienti mancanti</button><button class="btn largo" data-act="annulla-import">Annulla</button></div>';
    }
    h += '<div class="blocco"><h2>Copia di sicurezza</h2><p>Ultima copia: <b>' + fa(S.ultimoBackup) + '</b>. Salva il file su Google Drive: ti serve se cambi telefono o per portare i dati sul PC.</p>' +
      '<button class="btn primario largo" data-act="backup">Salva copia (Drive, WhatsApp, file…)</button>' +
      '<label class="btn largo" for="file-bk">Ripristina da una copia</label><input id="file-bk" type="file" accept=".json,application/json" hidden></div>';
    h += '<div class="blocco"><h2>Importa da Excel / ODS</h2><p>Foglio con colonne <b>Nome Cliente · Quantità · Tipo Estintori · Luogo</b>. Il ciclo (es. «Gennaio – luglio») si legge dal titolo. I clienti già presenti vengono saltati.</p>' +
      '<label class="btn largo" for="file-xl">Scegli il file</label><input id="file-xl" type="file" accept=".ods,.xlsx,.xls,.csv" hidden></div>';
    h += '<div class="blocco"><h2>Esporta</h2><p>Elenco completo dei clienti in Excel.</p><button class="btn largo" data-act="esporta-excel">Scarica Excel</button></div>';
    h += '<div class="blocco"><h2>Stato</h2><p>' + attivi().length + ' clienti sul telefono. Archivio ' + (S.persist ? '<b>protetto</b> dalla pulizia automatica.' : 'non ancora protetto: fai ogni tanto la copia di sicurezza.') + '</p>' +
      (S.installEvent ? '<button class="btn primario largo" data-act="installa">Installa l\'app sul telefono</button>' : '') +
      '<button class="btn pericolo largo" data-act="svuota">Cancella tutti i dati</button></div>';
    app.innerHTML = h;
  }

  // ---------- schede (dettaglio / modulo / fatto) ----------
  let schedaAperta = false;
  function apriScheda(html) {
    const sc = $('#scheda');
    sc.innerHTML = '<div class="maniglia"></div>' + html;
    $('#toast').hidden = true; sc.scrollTop = 0; sc.hidden = false; $('#velo').hidden = false; document.body.style.overflow = 'hidden';
    if (!schedaAperta) { history.pushState({ scheda: 1 }, ''); schedaAperta = true; }
  }
  function chiudiScheda(daPop) {
    if (!schedaAperta) return;
    $('#scheda').hidden = true; $('#velo').hidden = true; document.body.style.overflow = ''; schedaAperta = false;
    if (!daPop && history.state && history.state.scheda) history.back();
  }
  window.addEventListener('popstate', () => chiudiScheda(true));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudiScheda(); });
  $('#velo').addEventListener('click', () => chiudiScheda());

  function opzioniCiclo(sel) {
    return L.MESI_BREVI.slice(0, 6).map((m, i) => '<option value="' + (i + 1) + '"' + (sel === i + 1 ? ' selected' : '') + '>' + m + ' / ' + L.MESI_BREVI[i + 6] + '</option>').join('');
  }
  function campo(id, et, val, tipo, extra) {
    return '<label class="campo"><span>' + et + '</span><input id="' + id + '" type="' + (tipo || 'text') + '" value="' + esc(val || '') + '" ' + (extra || '') + '></label>';
  }
  function apriModulo(id) {
    const c = id ? S.clienti.find(x => x.id === id) : null;
    const primo = c ? Math.min(...c.ciclo) : 1;
    const scad = c ? c.scadenza : L.scadenzaIniziale([1, 7]);
    let h = '<h2>' + (c ? esc(c.nome) : 'Nuovo cliente') + '</h2>';
    if (c) {
      const st = stato(c);
      h += '<p><span class="badge ' + st + '">' + esc(badgeTesto(c, st)) + '</span> &nbsp;Ciclo ' + esc(L.etichettaCiclo(c.ciclo)) + (c.ultima ? ' · ultimo intervento ' + dataIt(c.ultima) : '') + '</p>' +
        '<div class="azioni"><a class="btn" href="' + esc(mapsUrl(c)) + '" target="_blank" rel="noopener">' + ic.nav + 'Naviga</a>' +
        (c.telefono ? '<a class="btn" href="tel:' + esc(c.telefono.replace(/\s+/g, '')) + '">' + ic.tel + 'Chiama</a>' : '') +
        '<button class="btn ok" data-act="fatto" data-id="' + esc(c.id) + '">' + ic.ok + 'Fatto</button></div>';
    }
    h += '<div class="sez">Dati</div>' +
      campo('f-nome', 'Nome cliente *', c && c.nome) +
      campo('f-ind', 'Indirizzo', c && c.indirizzo, 'text', 'autocomplete="off"') +
      '<div class="due">' + campo('f-comune', 'Comune / luogo *', c && c.comune) + campo('f-indnote', 'Note indirizzo', c && c.indirizzoNote, 'text', 'placeholder="es. ingresso sul retro"') + '</div>' +
      '<div class="due">' + campo('f-ref', 'Referente', c && c.referente) + campo('f-tel', 'Telefono', c && c.telefono, 'tel') + '</div>' +
      campo('f-mail', 'Email', c && c.email, 'email') +
      '<div class="sez">Estintori e scadenza</div>' +
      '<label class="campo"><span>Estintori (sigle) *</span><input id="f-sigle" type="text" autocapitalize="none" autocomplete="off" value="' + esc(c ? testoSigle(c.estintori) : '') + '" placeholder="es. 2 P6, 1 K2, 1 aut. P6"><div id="f-anteprima" class="anteprima">P6 polvere 6 kg · K2 CO₂ 2 kg · K5 CO₂ 5 kg · Lt6 schiumogeno 6 L · aut. · carr.</div></label>' +
      '<div class="due"><label class="campo"><span>Ciclo semestrale</span><select id="f-ciclo">' + opzioniCiclo(primo) + '</select></label>' +
      campo('f-scad', 'Prossima scadenza', scad.slice(0, 7), 'month') + '</div>' +
      '<label class="campo"><span>Note</span><textarea id="f-note">' + esc(c && c.note) + '</textarea></label>' +
      '<button class="btn primario largo" data-act="salva-cliente" data-id="' + esc(c ? c.id : '') + '">Salva</button>';
    if (c) {
      h += '<div class="sez">Storico interventi</div>' + ((c.interventi || []).length
        ? '<ul class="storico">' + [...c.interventi].sort((a, b) => cmp(b.data, a.data)).map(i => '<li><span>' + dataIt(i.data) + '</span><span>' + esc(i.note || '') + '</span></li>').join('') + '</ul>'
        : '<p class="anteprima">Nessun intervento registrato.</p>') +
        '<div style="height:18px"></div><button class="btn pericolo largo" data-act="elimina" data-id="' + esc(c.id) + '">Elimina cliente</button>';
    }
    apriScheda(h);
    const sigle = $('#f-sigle'), an = $('#f-anteprima');
    const aggiorna = () => {
      if (!sigle.value.trim()) return;
      const r = L.parseTipo(sigle.value);
      an.className = 'anteprima ' + (r.errori.length ? 'ko' : 'ok');
      an.textContent = r.errori.length ? r.errori[0] : L.totale(r.lista) + ' estintori: ' + r.lista.map(e => e.quantita + ' × ' + e.descrizione).join(', ');
    };
    sigle.addEventListener('input', aggiorna);
    if (c) aggiorna();
    if (!c) $('#f-ciclo').addEventListener('change', e => { $('#f-scad').value = L.scadenzaIniziale([+e.target.value, +e.target.value + 6]).slice(0, 7); });
  }

  async function salvaModulo(id) {
    const v = i => ($('#' + i).value || '').trim();
    const nome = v('f-nome'), comune = v('f-comune');
    if (!nome || !comune) return toast('Nome e comune sono obbligatori');
    const r = L.parseTipo(v('f-sigle'));
    if (!v('f-sigle') || r.errori.length) return toast(r.errori[0] || 'Inserisci almeno un estintore');
    const primo = +$('#f-ciclo').value, ciclo = [primo, primo + 6], mese = v('f-scad');
    const comuni = {
      nome, indirizzo: v('f-ind') || null, indirizzoNote: v('f-indnote') || null, comune, referente: v('f-ref') || null,
      telefono: v('f-tel') || null, email: v('f-mail') || null, note: v('f-note') || null,
    };
    if (id) {
      const c = S.clienti.find(x => x.id === id), vecchioTesto = testoSigle(c.estintori);
      Object.assign(c, comuni);
      if (v('f-sigle') !== vecchioTesto) c.estintori = r.lista;
      const cambioCiclo = primo !== Math.min(...c.ciclo);
      if (cambioCiclo) c.ciclo = ciclo;
      if (mese && mese !== c.scadenza.slice(0, 7)) c.scadenza = L.fineMese(+mese.slice(0, 4), +mese.slice(5, 7));
      else if (cambioCiclo) c.scadenza = L.scadenzaIniziale(ciclo);
      await salvaCliente(c);
    } else {
      if (S.clienti.some(x => L.chiaveCliente(x) === L.chiaveCliente(comuni))) return toast('Esiste già un cliente con questo nome e indirizzo');
      const nuovo = L.nuovoCliente(Object.assign(comuni, { ciclo, estintori: r.lista,
        scadenza: mese ? L.fineMese(+mese.slice(0, 4), +mese.slice(5, 7)) : undefined }));
      await salvaCliente(nuovo);
    }
    chiudiScheda(); toast('Cliente salvato'); render();
  }

  function apriFatto(id) {
    const c = S.clienti.find(x => x.id === id);
    const nuova = d => L.etichettaScadenza(L.scadenzaDopoIntervento(c.ciclo, d));
    apriScheda('<h2>Intervento completato</h2><p style="margin-top:-6px">' + esc(c.nome) + '</p>' +
      '<label class="campo"><span>Data intervento</span><input id="fatto-data" type="date" value="' + oggi() + '"></label>' +
      '<label class="campo"><span>Note (opzionale)</span><input id="fatto-note" type="text" placeholder="es. sostituito un K2"></label>' +
      '<p class="anteprima" id="fatto-prossima">Prossima scadenza: <b>' + nuova(oggi()) + '</b></p>' +
      '<button class="btn ok largo" data-act="conferma-fatto" data-id="' + esc(id) + '">Registra intervento</button>');
    $('#fatto-data').addEventListener('input', e => { if (e.target.value) $('#fatto-prossima').innerHTML = 'Prossima scadenza: <b>' + nuova(e.target.value) + '</b>'; });
  }
  async function confermaFatto(id) {
    const c = S.clienti.find(x => x.id === id), data = $('#fatto-data').value;
    if (!data) return toast('Scegli la data');
    const prima = JSON.parse(JSON.stringify(c));
    c.interventi = c.interventi || []; c.interventi.push({ data, note: $('#fatto-note').value.trim() || null });
    c.ultima = (!c.ultima || data > c.ultima) ? data : c.ultima;
    c.scadenza = L.scadenzaDopoIntervento(c.ciclo, data);
    await salvaCliente(c); chiudiScheda(); render();
    toast(c.nome + ': prossima scadenza ' + L.etichettaScadenza(c.scadenza), 'Annulla', async () => { await salvaCliente(prima); render(); });
  }

  // ---------- dati: import / export ----------
  async function leggiFileExcel(file) {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
      S.importFile = { nome: file.name, analisi: L.analizzaRighe(rows) }; S.importBackup = null;
    } catch (e) { toast('File non leggibile: ' + e.message); }
    renderDati(); window.scrollTo(0, 0);
  }
  async function confermaImport() {
    const imp = S.importFile; let mesi = imp.analisi.mesi;
    if (!mesi.length) {
      const m1 = +$('#imp-m1').value, m2 = +$('#imp-m2').value;
      if (!m1 || !m2 || m1 === m2) return toast('Scegli due mesi diversi');
      mesi = [m1, m2].sort((a, b) => a - b);
    }
    const r = L.clientiDaImportare(S.clienti, imp.analisi, mesi);
    await A.salvaMolti(r.nuovi); S.clienti.push(...r.nuovi); S.importFile = null;
    let msg = 'Importati ' + r.nuovi.length + ' clienti';
    if (r.saltatiEsistenti.length) msg += ' · ' + r.saltatiEsistenti.length + ' già presenti';
    if (r.saltatiErrori.length) msg += ' · ' + r.saltatiErrori.length + ' con sigle da correggere';
    toast(msg); setTab('fare');
  }
  async function salvaFile(nome, blob) {
    const f = new File([blob], nome, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f], title: nome }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); return true;
  }
  async function backup() {
    const dati = { app: 'scadenze-estintori', versione: 1, esportato: new Date().toISOString(), clienti: S.clienti };
    const ok = await salvaFile('copia-estintori-' + oggi() + '.json', new Blob([JSON.stringify(dati)], { type: 'application/json' }));
    if (ok) { S.ultimoBackup = new Date().toISOString(); await A.scriviMeta('ultimoBackup', S.ultimoBackup); toast('Copia salvata'); render(); }
  }
  async function leggiBackup(file) {
    try {
      const d = JSON.parse(await file.text());
      if (!d || !Array.isArray(d.clienti)) throw new Error('formato non valido');
      S.importBackup = d; S.importFile = null;
    } catch (e) { toast('Copia non valida: ' + e.message); }
    renderDati(); window.scrollTo(0, 0);
  }
  function esportaExcel() {
    const righe = attivi().sort((a, b) => cmp(a.nome, b.nome)).map(c => ({
      Cliente: c.nome, Indirizzo: c.indirizzo || '', Comune: c.comune || '', Telefono: c.telefono || '',
      Estintori: (c.estintori || []).map(L.sigla).join(' '), 'N. estintori': nEst(c), Ciclo: L.etichettaCiclo(c.ciclo),
      'Ultima manutenzione': dataIt(c.ultima), 'Prossima scadenza': L.etichettaScadenza(c.scadenza), Note: c.note || '' }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(righe), 'Clienti');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    salvaFile('clienti-' + oggi() + '.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  // ---------- navigazione e eventi ----------
  const TITOLI = { fare: 'Da fare', clienti: 'Clienti', dati: 'Dati' };
  function render() {
    document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    $('#titolo').textContent = TITOLI[S.tab];
    $('#btn-nuovo-top').hidden = S.tab === 'dati';
    if (S.tab === 'fare') { $('#sottotitolo').textContent = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); renderFare(); }
    else if (S.tab === 'clienti') renderClienti();
    else { $('#sottotitolo').textContent = 'Copie di sicurezza, importazione, esportazione'; renderDati(); }
  }
  function setTab(t) { S.tab = t; pref.scrivi(); render(); window.scrollTo(0, 0); }

  document.addEventListener('click', async e => {
    if (e.target.closest('[data-stop]')) return;            // link Naviga / Chiama
    const tab = e.target.closest('[data-tab]'); if (tab) return setTab(tab.dataset.tab);
    const g = e.target.closest('[data-giorni]'); if (g) { S.giorni = +g.dataset.giorni; pref.scrivi(); return renderFare(); }
    const k = e.target.closest('[data-comune]');
    if (k) { const v = k.dataset.comune; if (!v && k.textContent === 'Tutti') S.comuni.clear(); else if (S.comuni.has(v)) S.comuni.delete(v); else S.comuni.add(v); return renderFare(); }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case 'apri': return apriModulo(id);
      case 'nuovo': return apriModulo(null);
      case 'fatto': e.stopPropagation(); return apriFatto(id);
      case 'salva-cliente': return salvaModulo(id);
      case 'conferma-fatto': return confermaFatto(id);
      case 'raggruppa': S.raggruppa = !S.raggruppa; pref.scrivi(); return renderFare();
      case 'elimina':
        if (confirm('Eliminare definitivamente questo cliente e il suo storico?')) {
          await A.elimina(id); S.clienti = S.clienti.filter(c => c.id !== id); chiudiScheda(); render(); toast('Cliente eliminato');
        } return;
      case 'backup': return backup();
      case 'esporta-excel': return esportaExcel();
      case 'conferma-import': return confermaImport();
      case 'annulla-import': S.importFile = null; S.importBackup = null; return renderDati();
      case 'bk-sostituisci':
        if (!confirm('Sostituire tutti i dati attuali con quelli della copia?')) return;
        await A.sostituisciTutto(S.importBackup.clienti); S.clienti = S.importBackup.clienti; S.importBackup = null; toast('Dati ripristinati'); return setTab('fare');
      case 'bk-unisci': {
        const ids = new Set(S.clienti.map(c => c.id)), nuovi = S.importBackup.clienti.filter(c => !ids.has(c.id));
        await A.salvaMolti(nuovi); S.clienti.push(...nuovi); S.importBackup = null; toast('Aggiunti ' + nuovi.length + ' clienti'); return setTab('fare');
      }
      case 'svuota':
        if (confirm('Cancellare TUTTI i clienti dal telefono? Fai prima una copia di sicurezza.') && confirm('Sei sicuro? L\'operazione non si può annullare.')) {
          await A.svuota(); S.clienti = []; toast('Dati cancellati'); render();
        } return;
      case 'installa': S.installEvent.prompt(); S.installEvent = null; return renderDati();
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'cerca') { S.cerca = e.target.value; renderListaFare(); }
    else if (e.target.id === 'cerca-c') { S.cercaClienti = e.target.value; renderListaClienti(); }
  });
  document.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (e.target.id === 'file-xl') leggiFileExcel(f); else if (e.target.id === 'file-bk') leggiBackup(f);
    e.target.value = '';
  });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvent = e; if (S.tab === 'dati') renderDati(); });

  // ---------- avvio ----------
  (async function avvio() {
    pref.leggi();
    try {
      S.clienti = await A.tutti(); S.ultimoBackup = await A.leggiMeta('ultimoBackup');
      if (navigator.storage && navigator.storage.persist) S.persist = await navigator.storage.persist();
    } catch (e) { app.innerHTML = '<div class="avviso ko">Impossibile aprire l\'archivio dati: ' + esc(e.message) + '. Se stai usando la navigazione privata, aprila in una scheda normale.</div>'; return; }
    render();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  })();
})();
