// 7.0: almacenamiento en el propio teléfono o computadora (IndexedDB). Nada sale del equipo.
// Misma estructura que Android: historias (id -> datos), fotos (nombre -> bytes) y preferencias
// (ajustes, vademecum, equipo, agenda: textos), para que las copias de seguridad sirvan en ambos.
const Almacen = (() => {
  const GEN = '__GEN__';
  let db = null;
  const historias = new Map();   // id -> { id, datos, modificado }
  const prefs = new Map();       // nombre -> { clave: texto }

  function abrir() {
    return new Promise((ok, mal) => {
      const r = indexedDB.open(INSTITUCION.baseDatos, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('historias')) d.createObjectStore('historias', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('fotos')) d.createObjectStore('fotos', { keyPath: 'nombre' });
        if (!d.objectStoreNames.contains('prefs')) d.createObjectStore('prefs', { keyPath: 'nombre' });
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
  }

  function tx(store, modo, f) {
    return new Promise((ok, mal) => {
      const t = db.transaction(store, modo);
      const s = t.objectStore(store);
      let res;
      const r = f(s);
      if (r) r.onsuccess = () => { res = r.result; };
      t.oncomplete = () => ok(res);
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error);
    });
  }

  async function iniciar() {
    db = await abrir();
    const todas = await tx('historias', 'readonly', (s) => s.getAll());
    for (const h of todas || []) historias.set(h.id, h);
    const ps = await tx('prefs', 'readonly', (s) => s.getAll());
    for (const p of ps || []) prefs.set(p.nombre, p.valores || {});
    // Pide al navegador que no borre los datos para liberar espacio (iPhone y Windows)
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {}
  }

  const nuevoId = (() => { let ultimo = 0; return () => { let t = Date.now(); if (t <= ultimo) t = ultimo + 1; ultimo = t; return String(t); }; })();

  async function guardar(id, datos, modificado) {
    const h = { id, datos: { ...datos }, modificado: modificado || Date.now() };
    historias.set(id, h);
    await tx('historias', 'readwrite', (s) => s.put(h));
  }

  function cargar(id) { const h = historias.get(id); return h ? { ...h.datos } : {}; }
  function existe(id) { return historias.has(id); }
  function modificado(id) { const h = historias.get(id); return h ? h.modificado : 0; }

  // 8.3: lo eliminado se recuerda ("h:<id>" historia, "a:<id>" evento de agenda -> momento) para que al sincronizar
  // con otro equipo no reaparezca. Misma clave que Android (preferencias "copia" > "borrados").
  function borrados() { try { return JSON.parse(pref('copia', 'borrados', '{}')) || {}; } catch (_) { return {}; } }
  async function ponerBorrados(o) { await ponerPref('copia', { borrados: JSON.stringify(o) }); }
  async function marcarBorrado(clave) { const o = borrados(); o[clave] = Date.now(); await ponerBorrados(o); }

  /** Quita la historia sin dejar marca (la marca ya existe: viene de otro equipo). */
  async function quitar(id) {
    historias.delete(id);
    await tx('historias', 'readwrite', (s) => s.delete(id));
  }

  async function borrar(id) {
    await quitar(id);
    await marcarBorrado('h:' + id);
  }

  /** Borra todo lo de este equipo (al cambiar de cuenta de Google) sin dejar marcas de eliminado; conserva la sesión ("nube"). */
  async function limpiarLocal() {
    const nube = prefs.get('nube');
    historias.clear(); prefs.clear();
    for (const s of ['historias', 'fotos', 'prefs']) await tx(s, 'readwrite', (x) => x.clear());
    if (nube) await ponerPref('nube', nube);
  }

  async function duplicar(id) {
    const n = nuevoId();
    const d = cargar(id);
    d.NOMBRE = (d.NOMBRE || '') + ' (COPIA)';
    await guardar(n, d);
    return n;
  }

  /** Igual que Almacen.listar() de Android: resúmenes, lo más reciente primero. */
  function listar() {
    return [...historias.values()].map((h) => {
      const d = h.datos;
      return {
        id: h.id,
        nombre: (d.NOMBRE || '').trim() ? d.NOMBRE : '(SIN NOMBRE)',
        fecha: (d.FECHA || '').trim() ? d.FECHA : (d.FECHA_EGRESO || ''),
        modificado: h.modificado,
        cedula: d.CEDULA || '',
        edad: d.EDAD || '',
        tipo: (d.TIPO || '').trim() ? d.TIPO : 'APENDICITIS',
      };
    }).sort((a, b) => b.modificado - a.modificado);
  }

  // ------------------------------------------------------------------ preferencias

  function pref(nombre, clave, defecto = '') {
    const p = prefs.get(nombre);
    return p && p[clave] != null ? p[clave] : defecto;
  }
  function todasPref(nombre) { return { ...(prefs.get(nombre) || {}) }; }
  async function ponerPref(nombre, valores) {
    const p = { ...(prefs.get(nombre) || {}), ...valores };
    prefs.set(nombre, p);
    await tx('prefs', 'readwrite', (s) => s.put({ nombre, valores: p }));
  }

  // ------------------------------------------------------------------ fotos

  async function guardarFoto(nombre, bytes) { await tx('fotos', 'readwrite', (s) => s.put({ nombre, bytes })); }
  async function foto(nombre) { const r = await tx('fotos', 'readonly', (s) => s.get(nombre)); return r ? r.bytes : null; }
  async function existeFoto(nombre) { const r = await tx('fotos', 'readonly', (s) => s.getKey(nombre)); return r != null; }

  return { GEN, iniciar, nuevoId, guardar, cargar, existe, modificado, borrar, quitar, borrados, ponerBorrados, marcarBorrado, limpiarLocal, duplicar, listar, pref, todasPref, ponerPref, guardarFoto, foto, existeFoto };
})();
