/* Archivio sul telefono (IndexedDB). Ogni cliente è un documento con estintori e interventi dentro. */
(function (root) {
  'use strict';
  const NOME = 'scadenze-estintori', VERSIONE = 1;
  let _db = null;

  function apri() {
    if (_db) return Promise.resolve(_db);
    return new Promise((ok, ko) => {
      const rq = indexedDB.open(NOME, VERSIONE);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains('clienti')) d.createObjectStore('clienti', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      };
      rq.onsuccess = () => { _db = rq.result; ok(_db); };
      rq.onerror = () => ko(rq.error);
    });
  }
  function tx(store, modo, fn) {
    return apri().then(d => new Promise((ok, ko) => {
      const t = d.transaction(store, modo);
      const risultato = fn(t.objectStore(store));
      t.oncomplete = () => ok(risultato && risultato.result !== undefined ? risultato.result : undefined);
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error);
    }));
  }
  const tutti = () => tx('clienti', 'readonly', s => s.getAll());
  const salva = c => tx('clienti', 'readwrite', s => s.put(c));
  const elimina = id => tx('clienti', 'readwrite', s => s.delete(id));
  const salvaMolti = lista => tx('clienti', 'readwrite', s => { lista.forEach(c => s.put(c)); });
  const sostituisciTutto = lista => tx('clienti', 'readwrite', s => { s.clear(); lista.forEach(c => s.put(c)); });
  const svuota = () => tx('clienti', 'readwrite', s => s.clear());
  const leggiMeta = k => tx('meta', 'readonly', s => s.get(k)).then(r => r ? r.v : null);
  const scriviMeta = (k, v) => tx('meta', 'readwrite', s => s.put({ k, v }));

  root.Archivio = { tutti, salva, elimina, salvaMolti, sostituisciTutto, svuota, leggiMeta, scriviMeta };
})(self);
