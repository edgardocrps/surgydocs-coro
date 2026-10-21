// 7.0: acceso al núcleo (trabajador.js). Todas las funciones devuelven promesas.
const Nucleo = (() => {
  const trabajador = new Worker('trabajador.js');
  let siguiente = 1;
  const pendientes = new Map();
  trabajador.onmessage = (e) => {
    const { id, r, error } = e.data;
    const p = pendientes.get(id);
    if (!p) return;
    pendientes.delete(id);
    if (error) p.rechazar(new Error(error)); else p.resolver(r);
  };
  trabajador.onerror = (e) => console.error('Núcleo:', e.message);
  function llamar(fn, ...args) {
    return new Promise((resolver, rechazar) => {
      const id = siguiente++;
      pendientes.set(id, { resolver, rechazar });
      trabajador.postMessage({ id, fn, args });
    });
  }
  const json = async (fn, ...args) => { const t = await llamar(fn, ...args); return t ? JSON.parse(t) : null; };
  const esquemas = new Map();
  return {
    llamar,
    modulos: () => json('modulos'),
    esquema: async (mod) => { if (!esquemas.has(mod)) esquemas.set(mod, await json('esquema', mod)); return esquemas.get(mod); },
    accion: (mod, i, v) => json('accion', mod, i, JSON.stringify(v)),
    sugerencias: (mod, clave, v) => json('sugerencias', mod, clave, JSON.stringify(v)),
    compartir: (mod, clave, v) => llamar('compartir', mod, clave, JSON.stringify(v)),
    adjunto: (mod, clave, v) => json('adjunto', mod, clave, JSON.stringify(v)),
    datos: (mod, v, gen) => json('datos', mod, JSON.stringify(v), JSON.stringify(gen || {})),
    plantilla: (mod, v) => llamar('plantilla', mod, JSON.stringify(v)),
    documento: (mod, datos, plantilla) => llamar('documento', mod, JSON.stringify(datos), plantilla),
    salida: (mod, datos, plantilla, fotos) => llamar('salida', mod, JSON.stringify(datos), plantilla, JSON.stringify(fotos || {})),
    traspaso: (d, tipo, cirujano) => json('traspaso', JSON.stringify(d), tipo, cirujano || ''),
    ordenesHernia: (tipo) => json('ordenesHernia', tipo),
    ordenesNpt: (d) => json('ordenesNpt', JSON.stringify(d)),
    catalogoMeds: () => json('catalogoMeds'),
    cedula: (t) => llamar('cedula', t),
    vademecumNombres: (propios) => json('vademecumNombres', propios || '[]'),
    vademecumBuscar: (n, propios) => json('vademecumBuscar', n, propios || '[]'),
    vademecumRecordar: (propios, meds) => llamar('vademecumRecordar', propios || '[]', meds),
  };
})();
