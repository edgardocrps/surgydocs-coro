// 7.0: guarda los archivos de la app en el equipo para que funcione sin internet.
// Lo genera tools/construir_web.sh (lista de archivos y versión); no editar sw.js a mano.
// SurgyDocs usa 'historias-' y SurgyDocs C usa 'coro-' (mismo dominio: cada una borra solo sus propias versiones viejas)
const PREFIJO = 'coro-';
const CACHE = PREFIJO + '8.5.0-c370dccfdc';
const ARCHIVOS = ["./","app.css","assets/base_formatos.docx","assets/damero.docx","assets/plantilla_apendicitis.docx","assets/plantilla_biliar.docx","assets/plantilla_hernia_inguinal.docx","assets/plantilla_hernia_umbilical.docx","assets/plantilla_obstruccion.docx","assets/plantilla_politrauma.docx","assets/plantilla_vascular.docx","assets/presentacion_electivos.pptx","iconos/favicon.png","iconos/icono.ico","iconos/icono.svg","iconos/icono-180.png","iconos/icono-192.png","iconos/icono-512.png","iconos/icono-maskable-512.png","iconos/logo.svg","index.html","js/almacen.js","js/app.js","js/config.js","js/copia.js","js/editor.js","js/iconos.js","js/logica.js","js/nube.js","js/nucleo.js","js/ui.js","js/vistaprevia.js","lib/docx-preview.min.js","lib/jszip.min.js","manifest.webmanifest","nucleo.js","trabajador.js"];

self.addEventListener('install', (e) => {
  // cache: 'reload' = se bajan de GitHub Pages, no de la caché del navegador (que podría tener una publicación anterior)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith(PREFIJO) && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const r = await c.match(e.request, { ignoreSearch: true });
    if (r) return r;
    try {
      const n = await fetch(e.request);
      if (n.ok) c.put(e.request, n.clone());
      return n;
    } catch (_) {
      return (await c.match('index.html')) || Response.error();
    }
  }));
});
