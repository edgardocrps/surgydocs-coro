// 7.0: el núcleo de la app (los mismos generadores de Android, compilados a JavaScript) corre en segundo plano
// para que la pantalla no se congele mientras se arma el Word o la presentación.
importScripts('nucleo.js');
// Ojo: nucleo.js define funciones globales (plantilla, documento, datos…); aquí no se usan esos nombres.

const plantillas = new Map();

function bytesABase64(bytes) {
  let s = '';
  const paso = 0x8000;
  for (let i = 0; i < bytes.length; i += paso) s += String.fromCharCode.apply(null, bytes.subarray(i, i + paso));
  return btoa(s);
}

async function cargarPlantilla(nombre) {
  if (!plantillas.has(nombre)) {
    const r = await fetch('assets/' + nombre);
    if (!r.ok) throw new Error('No se encontró la plantilla ' + nombre);
    plantillas.set(nombre, bytesABase64(new Uint8Array(await r.arrayBuffer())));
  }
  return plantillas.get(nombre);
}

const especiales = {
  // documento(mod, datosJson, nombrePlantilla) -> base64
  async documento(mod, datos, nombre) { return self.documento(mod, datos, await cargarPlantilla(nombre)); },
  // salida(mod, datosJson, nombrePlantilla, fotosJson) -> base64
  async salida(mod, datos, nombre, fotos) { return self.salida(mod, datos, await cargarPlantilla(nombre), fotos); },
};

self.onmessage = async (e) => {
  const { id, fn, args } = e.data;
  try {
    const f = especiales[fn] || self[fn];
    if (typeof f !== 'function') throw new Error('Función desconocida: ' + fn);
    const r = await f.apply(null, args);
    self.postMessage({ id, r });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
