// 7.0: copia de seguridad y "Enviar paciente" con el MISMO formato .zip de Android (Copia.kt):
// historias/ID.json, fotos/, preferencias/*.json e info.json. Un archivo hecho en Android se abre aquí y al revés.
const Copia = (() => {
  const PREFERENCIAS = ['ajustes', 'vademecum', 'equipo', 'agenda'];
  const d2 = (n) => String(n).padStart(2, '0');
  // Las fechas de un .zip no tienen zona horaria: Android guarda la hora local y JSZip la lee/escribe como UTC.
  // Se convierte para que la "historia más reciente" se decida igual en Android, iPhone y Windows.
  const aZip = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  const desdeZip = (d) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime();

  function nombreArchivo() {
    const d = new Date();
    return `${INSTITUCION.archivoCopia}_copia_${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}_${d2(d.getHours())}${d2(d.getMinutes())}.zip`;
  }
  const ultima = () => parseInt(Almacen.pref('copia', 'ultima', '0'), 10) || 0;
  const diasSinCopia = () => { const u = ultima(); return u > 0 ? Math.floor((Date.now() - u) / 86400000) : null; };

  function nombresFotos(ids) {
    const s = new Set();
    for (const id of ids) {
      const d = Almacen.cargar(id);
      for (const k of Object.keys(d)) if (k.startsWith('FOTO_')) for (const n of (d[k] || '').split('\n')) if (n.trim()) s.add(n.trim());
    }
    return [...s];
  }

  async function agregar(zip, ids) {
    for (const id of ids) {
      if (!Almacen.existe(id)) continue;
      zip.file(`historias/${id}.json`, JSON.stringify(Almacen.cargar(id)), { date: aZip(Almacen.modificado(id)) });
    }
    for (const n of nombresFotos(ids)) {
      if (n.includes('/') || n.includes('..')) continue;
      const b = await Almacen.foto(n);
      if (b) zip.file(`fotos/${n}`, b);
    }
  }

  /** Copia completa: todas las historias, sus fotos y lo que la app recuerda. */
  async function exportar(marcarCopia = true) {
    const zip = new JSZip();
    zip.file('borrados.json', JSON.stringify(Almacen.borrados()));
    const ids = Almacen.listar().map((r) => r.id);
    await agregar(zip, ids);
    for (const p of PREFERENCIAS) {
      const o = {};
      for (const [k, v] of Object.entries(Almacen.todasPref(p))) if (typeof v === 'string') o[k] = v;
      zip.file(`preferencias/${p}.json`, JSON.stringify(o));
    }
    zip.file('info.json', JSON.stringify({ app: 'HistoriasCirugia', historias: ids.length, fecha: Date.now(), origen: 'web ' + VERSION }));
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE' });
    // La sincronización con Drive no cuenta como "copia de seguridad guardada" por el usuario
    if (marcarCopia) await Almacen.ponerPref('copia', { ultima: String(Date.now()) });
    return { blob, nombre: nombreArchivo(), n: ids.length };
  }

  const nombrePaciente = (n) => 'Paciente_' + ((n || '').trim() || 'SIN_NOMBRE').replace(/[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]+/g, '_').replace(/^_+|_+$/g, '') + '.zip';

  /** Los documentos de UN paciente, para pasarlo a otro teléfono (Android, iPhone o Windows). */
  async function exportarPaciente(ids, nombre, cedula) {
    const zip = new JSZip();
    await agregar(zip, ids);
    const n = ids.filter((id) => Almacen.existe(id)).length;
    zip.file('info.json', JSON.stringify({ app: 'HistoriasCirugia', tipo: 'paciente', nombre, cedula, historias: n, fecha: Date.now() }));
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE' });
    return { blob, nombre: nombrePaciente(nombre), n };
  }

  /** Qué trae el archivo: paciente o copia completa; null si no es de esta app. */
  async function info(archivo) {
    try {
      const zip = await JSZip.loadAsync(archivo);
      const i = zip.file('info.json');
      if (!i) return null;
      const o = JSON.parse(await i.async('string'));
      if (o.app !== 'HistoriasCirugia') return null;
      const n = Object.keys(zip.files).filter((k) => k.startsWith('historias/') && k.endsWith('.json')).length;
      return { paciente: o.tipo === 'paciente', nombre: o.nombre || '', cedula: o.cedula || '', historias: n };
    } catch (_) { return null; }
  }

  /** Agrega las historias del archivo; si una ya existe, se conserva la más reciente. Devuelve cuántas, o -1. */
  /** Une dos listas JSON guardadas como texto (eventos, medicamentos propios, nombres): sin repetidos y sin lo eliminado. */
  function unirListas(local, remoto, borrados) {
    try {
      const vistos = new Set();
      const out = [];
      for (const x of [...JSON.parse(local), ...JSON.parse(remoto)]) {
        const id = x && typeof x === 'object' && x.id ? String(x.id) : JSON.stringify(x);
        if (borrados['a:' + id] != null || vistos.has(id)) continue;
        vistos.add(id); out.push(x);
      }
      return JSON.stringify(out);
    } catch (_) { return local; }
  }

  /**
   * Agrega las historias del archivo; si una ya existe, se conserva la más reciente. Devuelve cuántas, o -1.
   * sincronizando (8.3): respeta lo eliminado, une las listas y deja lo de este equipo en perfil y ajustes.
   * A mano, lo que trae la copia vuelve a existir.
   */
  async function restaurar(archivo, sincronizando = false) {
    const zip = await JSZip.loadAsync(archivo);
    const i = zip.file('info.json');
    const valida = i ? (await i.async('string')).includes('HistoriasCirugia') : false;
    if (!valida) return -1;
    let n = 0;
    const borrados = Almacen.borrados();
    let remotos = {};
    const devueltos = [];
    if (sincronizando) { const b = zip.file('borrados.json'); if (b) { try { remotos = JSON.parse(await b.async('string')) || {}; } catch (_) {} } }
    for (const [nombre, e] of Object.entries(zip.files)) {
      if (e.dir || nombre.includes('..')) continue;
      if (nombre.startsWith('historias/') && nombre.endsWith('.json')) {
        const id = nombre.slice('historias/'.length, -'.json'.length);
        if (!id || id.includes('/')) continue;
        const fecha = e.date ? desdeZip(e.date) : 0;
        // Eliminado en este equipo: la versión de Drive solo vuelve si se editó DESPUÉS de eliminarla
        if (sincronizando && borrados['h:' + id] != null && !(fecha > 0 && fecha > Number(borrados['h:' + id]))) continue;
        if (!Almacen.existe(id) || (fecha > 0 && fecha > Almacen.modificado(id))) {
          devueltos.push('h:' + id);
          let d;
          try { d = JSON.parse(await e.async('string')); } catch (_) { continue; }
          const limpio = {};
          for (const [k, v] of Object.entries(d)) limpio[k] = v == null ? '' : String(v);
          // A mano (importar paciente, restaurar copia) el documento queda como "más reciente" para que gane sobre marcas de eliminado viejas
          await Almacen.guardar(id, limpio, sincronizando ? (fecha > 0 ? fecha : Date.now()) : Date.now());
          n++;
        }
      } else if (nombre.startsWith('fotos/') && nombre.split('/').length === 2) {
        const f = nombre.slice('fotos/'.length);
        if (f && !(await Almacen.existeFoto(f))) await Almacen.guardarFoto(f, await e.async('uint8array'));
      } else if (nombre.startsWith('preferencias/') && nombre.endsWith('.json')) {
        const p = nombre.slice('preferencias/'.length, -'.json'.length);
        if (!PREFERENCIAS.includes(p)) continue;
        try {
          const o = JSON.parse(await e.async('string'));
          const v = {};
          for (const [k, x] of Object.entries(o)) {
            if (typeof x !== 'string') continue;
            const local = Almacen.todasPref(p)[k];
            // Las listas se unen y lo demás (perfil, ajustes) conserva lo de este equipo: una copia ajena no pisa tu perfil ni tu agenda
            v[k] = local == null ? x : (x.startsWith('[') ? unirListas(local, x, borrados) : local);
          }
          await Almacen.ponerPref(p, v);
        } catch (_) {}
      }
    }
    if (sincronizando) {
      // Lo que se eliminó en otro equipo se elimina aquí (salvo que aquí se editó DESPUÉS); las marcas se acumulan en ambos lados.
      const todos = Almacen.borrados();
      for (const k of devueltos) delete todos[k];   // documentos que volvieron por editarse después de eliminarse
      for (const [k, t] of Object.entries(remotos)) {
        const existe = k.startsWith('h:') && Almacen.existe(k.slice(2));
        if (existe && Almacen.modificado(k.slice(2)) > Number(t)) continue;
        if (todos[k] == null) todos[k] = Number(t) || Date.now();
        if (existe) await Almacen.quitar(k.slice(2));
      }
      await Almacen.ponerBorrados(todos);
      const ev = Almacen.pref('agenda', 'eventos', null);
      if (ev != null) await Almacen.ponerPref('agenda', { eventos: unirListas(ev, '[]', todos) });
    } else if (devueltos.length) {
      const todos = Almacen.borrados();
      for (const k of devueltos) delete todos[k];
      await Almacen.ponerBorrados(todos);
    }
    return n;
  }

  return { exportar, exportarPaciente, info, restaurar, diasSinCopia, ultima, nombrePaciente };
})();
