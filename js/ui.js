// 7.0: piezas comunes de la interfaz (mismo aspecto que Android: azul marino, cian y tarjetas blancas).

/** Crea un elemento: h('div.clase', {onclick}, hijo1, 'texto', ...) */
function h(sel, props, ...hijos) {
  const [tag, ...clases] = sel.split('.');
  const e = document.createElement(tag || 'div');
  if (clases.length) e.className = clases.join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { hijos.unshift(props); props = null; }
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'html') e.innerHTML = v;
    else if (k in e && k !== 'list' && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}

function icono(nombre, clase = '') {
  const s = h('span.icono' + (clase ? '.' + clase : ''));
  s.innerHTML = ICONOS[nombre] || ICONOS.formatos;
  return s;
}

/** Botón con ícono, como botonIcono() de Android. */
function boton(texto, ico, estilo = 'cian', alTocar) {
  return h('button.boton.' + estilo, { type: 'button', onclick: alTocar }, ico ? icono(ico) : null, h('span', texto));
}

function insignia(texto, clase = '') { return h('div.insignia' + (clase ? '.' + clase : ''), texto); }
function insigniaIcono(nombre, clase = '') { return h('div.insignia.ico' + (clase ? '.' + clase : ''), icono(nombre)); }

let temporizadorAviso = null;
function aviso(texto, largo = false) {
  let t = document.getElementById('aviso');
  if (!t) { t = h('div'); t.id = 'aviso'; document.body.append(t); }
  t.textContent = texto;
  t.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => t.classList.remove('visible'), largo ? 4200 : 2400);
}

/** Hoja inferior (como las de Android). Devuelve { caja, cerrar }. */
function hojaInferior(titulo, sub) {
  const fondo = h('div.velo');
  const caja = h('div.hoja', h('div.asa'), h('div.hoja-titulo', mayus(titulo)), sub ? h('div.hoja-sub', sub) : null);
  const cerrar = () => { fondo.classList.remove('abierta'); setTimeout(() => fondo.remove(), 200); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') cerrar(); };
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
  document.addEventListener('keydown', esc);
  fondo.append(caja);
  document.body.append(fondo);
  requestAnimationFrame(() => fondo.classList.add('abierta'));
  return { caja, cerrar };
}

/** Diálogo con botones; resuelve con el índice elegido (o -1 si se cierra). */
function dialogo(titulo, mensaje, opciones, { lista = false } = {}) {
  return new Promise((ok) => {
    const fondo = h('div.velo.centro');
    let hecho = false;
    const fin = (i) => { if (hecho) return; hecho = true; fondo.classList.remove('abierta'); setTimeout(() => fondo.remove(), 150); ok(i); };
    const botones = opciones.map((o, i) => h('button.' + (lista ? 'opcion' : (i === opciones.length - 1 ? 'dlg-si' : 'dlg-no')), { type: 'button', onclick: () => fin(i) }, o));
    const caja = h('div.dialogo', titulo ? h('div.dlg-titulo', titulo) : null, mensaje ? h('div.dlg-texto', mensaje) : null,
      h('div' + (lista ? '.dlg-lista' : '.dlg-botones'), botones),
      lista ? h('div.dlg-botones', h('button.dlg-no', { type: 'button', onclick: () => fin(-1) }, 'Cancelar')) : null);
    fondo.addEventListener('click', (e) => { if (e.target === fondo) fin(-1); });
    fondo.append(caja);
    document.body.append(fondo);
    requestAnimationFrame(() => fondo.classList.add('abierta'));
  });
}
const confirmar = async (mensaje, si = 'Aceptar', titulo = '') => (await dialogo(titulo, mensaje, ['Cancelar', si])) === 1;
const elegir = (titulo, opciones) => dialogo(titulo, null, opciones, { lista: true });

function esperando(texto) {
  const v = h('div.velo.centro.abierta', h('div.esperando', h('div.giro'), h('div', texto)));
  document.body.append(v);
  return () => v.remove();
}

// ------------------------------------------------------------------ archivos: compartir, descargar, abrir

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const esWindows = /Windows/.test(navigator.userAgent) || !!window.chrome?.webview;
const enAppWindows = !!window.chrome?.webview;
const esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function deBase64(b64) {
  const s = atob(b64);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}
function aBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function descargar(blob, nombre) {
  if (enAppWindows) {
    // App de Windows: el programa guarda el archivo con la ventana "Guardar como" de Windows
    blob.arrayBuffer().then((b) => window.chrome.webview.postMessage({ tipo: 'guardar', nombre, datos: aBase64(new Uint8Array(b)) }));
    return;
  }
  if (esIOS) {
    // iPhone: la app instalada no descarga archivos; se usa la hoja de compartir ("Guardar en Archivos")
    const f = new File([blob], nombre, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: nombre }).catch(() => {}); return; }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}

/** Abre el archivo con el programa del equipo (Windows: Word / PowerPoint). En el iPhone: hoja de compartir. */
function abrirArchivo(blob, nombre) {
  if (enAppWindows) {
    blob.arrayBuffer().then((b) => window.chrome.webview.postMessage({ tipo: 'abrir', nombre, datos: aBase64(new Uint8Array(b)) }));
    return;
  }
  compartirArchivo(blob, nombre);
}

async function compartirArchivo(blob, nombre, texto) {
  const f = new File([blob], nombre, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f], title: nombre, text: texto }); return true; } catch (e) { if (e && e.name === 'AbortError') return false; }
  }
  descargar(blob, nombre);
  if (!enAppWindows) aviso('Archivo descargado: ' + nombre, true);
  return true;
}

/** Número venezolano para WhatsApp: 04141234567 -> 584141234567. */
function numeroWhatsApp(t) {
  const d = digitos(t);
  if (d.length === 11 && d.startsWith('0')) return '58' + d.slice(1);
  if (d.length === 10 && d.startsWith('4')) return '58' + d;
  if (d.length >= 11 && d.startsWith('58')) return d;
  return '';
}

function abrirEnlace(url) {
  if (enAppWindows) { window.chrome.webview.postMessage({ tipo: 'enlace', url }); return; }
  window.open(url, '_blank', 'noopener');
}

async function compartirTexto(texto, telefono = '') {
  const n = numeroWhatsApp(telefono);
  if (n) { abrirEnlace(`https://wa.me/${n}?text=${encodeURIComponent(texto)}`); return; }
  if (navigator.share && !esWindows) { try { await navigator.share({ text: texto }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  abrirEnlace(`https://wa.me/?text=${encodeURIComponent(texto)}`);
}

/**
 * Versión final: mensaje + documento. En el teléfono se comparten juntos (el paciente se elige en WhatsApp);
 * en la computadora el documento se guarda y se abre el chat con el mensaje para adjuntarlo.
 */
/** archivos: [{blob, nombre}] — todos van en un solo envío (lista de materiales + informe médico). */
async function enviarConAdjunto(texto, archivos, telefono = '') {
  const fs = archivos.map((a) => new File([a.blob], a.nombre, { type: a.blob.type }));
  if (!esWindows && navigator.canShare && navigator.canShare({ files: fs })) {
    try { await navigator.share({ files: fs, text: texto }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  for (const a of archivos) descargar(a.blob, a.nombre);
  const nombres = archivos.map((a) => a.nombre).join(' y ');
  aviso('Se guardó ' + nombres + '. Adjúntelo' + (archivos.length > 1 ? 's' : '') + ' en el chat de WhatsApp junto con el mensaje.', true);
  await compartirTexto(texto, telefono);
}

/** Elegir archivo(s) del equipo. */
function elegirArchivos(accept, multiple = false) {
  return new Promise((ok) => {
    const i = h('input', { type: 'file', accept, style: { display: 'none' } });
    if (multiple) i.multiple = true;
    i.addEventListener('change', () => { ok([...i.files]); i.remove(); });
    document.body.append(i);
    i.click();
  });
}

/**
 * 7.1: el texto nunca se corta a mitad de palabra ("CONSENTIMIENT / O"): si la palabra más larga no cabe en el
 * ancho de su botón, la letra se reduce hasta que quepa. Se aplica a los elementos con la clase "ajustar".
 */
const medidor = document.createElement('canvas').getContext('2d');
/** Los botones de un mismo grupo (data-grupo, o las opciones de una misma pregunta) quedan con la misma letra. */
function ajustarTextos(raiz) {
  const grupos = new Map();
  for (const e of raiz.querySelectorAll('.ajustar')) {
    e.style.fontSize = '';
    const cs = getComputedStyle(e);
    const ancho = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (ancho <= 0) continue;
    let t = parseFloat(cs.fontSize);
    const palabras = (e.textContent || '').split(/\s+/).filter(Boolean);
    const cabe = () => { medidor.font = `${cs.fontWeight} ${t}px ${cs.fontFamily}`; return palabras.every((p) => medidor.measureText(p).width <= ancho); };
    while (!cabe() && t > 8) t -= 0.5;
    const clave = e.dataset.grupo || e.closest('.chips') || e;
    const g = grupos.get(clave) || { t: Infinity, base: parseFloat(cs.fontSize), els: [] };
    g.t = Math.min(g.t, t); g.els.push(e);
    grupos.set(clave, g);
  }
  for (const g of grupos.values()) if (g.t < g.base) for (const e of g.els) e.style.fontSize = g.t + 'px';
}
