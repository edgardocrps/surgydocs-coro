// 7.0: formulario de una historia o documento (igual que EditorActivity de Android): pestañas, secciones,
// botones que redactan, vista previa y exportación a Word.
const Editor = (() => {
  let actual = null;   // estado del formulario abierto

  // ------------------------------------------------------------------ utilidades de valores

  /** Sin tildes, guiones ni espacios: valores guardados como "III-A" o "NAUSEAS" siguen marcados. */
  const normal = (t) => sinTildes(mayus(t)).replace(/[\s-]+/g, '');

  function valorPorDefecto(c) {
    switch (c.clave) {
      case 'CIRUJANO_GUARDIA': case 'ADJUNTO': case 'CITA_MEDICO': return Preferencias.cirujano() || c.inicial || '';
      case 'PROC_MEDICO': case 'BIO_MEDICO': return Preferencias.firma() || c.inicial || '';
      default: return c.inicial || '';
    }
  }

  function pestanaPara(st, titulo, propia, hojaPropia) {
    const t = mayus(titulo.trim());
    let nombre, hoja;
    if (propia != null) { nombre = propia; hoja = hojaPropia || 1; }
    else if (t.startsWith('DATOS DEL PACIENTE')) { nombre = 'PACIENTE'; hoja = 1; }
    else if (t.startsWith('PARTE III')) { nombre = 'PARTE III'; hoja = 3; }
    else if (t.startsWith('PARTE II')) { nombre = 'PARTE II'; hoja = 2; }
    else if (t.startsWith('PARTE I')) { nombre = 'PARTE I'; hoja = 1; }
    else if (t.startsWith('NOTA')) { nombre = 'NOTA'; hoja = 4; }
    else if (t.startsWith('ÓRDENES') || t.startsWith('ORDENES')) { nombre = 'ÓRDENES'; hoja = 6; }
    else { nombre = 'SOLICITUDES'; hoja = 7; }
    const i = st.pestanas.findIndex((p) => p.nombre === nombre);
    if (i >= 0) return i;
    st.pestanas.push({ nombre, hoja, desplazamiento: 0 });
    return st.pestanas.length - 1;
  }

  const leer = (k) => { const c = actual && actual.campos.get(k); return c ? c.leer() : ''; };
  const escribir = (k, v) => { const c = actual && actual.campos.get(k); if (c) c.escribir(v); };
  const getterValores = () => { const m = {}; for (const [k, c] of actual.campos) m[k] = c.leer(); return m; };
  const nombreCompleto = () => ['NOM1', 'NOM2', 'APE1', 'APE2'].map((k) => leer(k).trim()).filter(Boolean).join(' ').toLocaleUpperCase('es');
  function valoresActuales() { const m = getterValores(); m.NOMBRE = nombreCompleto(); m.TIPO = actual.mod; return m; }
  const paraNucleo = () => { const m = getterValores(); m.TIPO = actual.mod; return m; };

  function cambio(clave) {
    if (!actual) return;
    actual.sucio = true;
    aplicarDependencias();
    refrescarDinamicas(clave);
    if (clave === 'her_tipo' && actual.mod === 'PARED') ordenesHernia();
    automaticos(clave);
    if (['NOM1', 'NOM2', 'APE1', 'APE2'].includes(clave)) actualizarCabecera();
    clearTimeout(actual.temporizador);
    actual.temporizador = setTimeout(() => { guardar(); actualizarAvance(); }, 1200);
  }

  // ------------------------------------------------------------------ campos

  function etiqueta(t) { return h('div.etiqueta', mayus(t)); }

  function chips(c, valor) {
    const unico = !c.multi;
    const sel = [];
    const caja = h('div.chips', { style: { gridTemplateColumns: `repeat(${c.columnas || 2}, minmax(0, 1fr))` } });
    const botones = c.opciones.map((op) => {
      const b = h('button.chip.ajustar', { type: 'button' }, mayus(op));
      b.addEventListener('click', () => {
        const i = sel.indexOf(op);
        if (i >= 0) sel.splice(i, 1); else { if (unico) sel.length = 0; sel.push(op); }
        pintar(); cambio(c.clave);
      });
      caja.append(b);
      return b;
    });
    const pintar = () => botones.forEach((b, i) => b.classList.toggle('activo', sel.includes(c.opciones[i])));
    const poner = (v) => {
      sel.length = 0;
      for (const x of (v || '').split('|')) if (x.trim()) {
        const t = x.trim();
        sel.push(c.opciones.find((o) => o === t) || c.opciones.find((o) => normal(o) === normal(t)) || t);
      }
      if (unico && sel.length > 1) sel.splice(1);
      pintar();
    };
    poner(valor);
    return { el: caja, leer: () => c.opciones.filter((o) => sel.includes(o)).join('|'), escribir: poner };
  }

  function interruptor(c, valor) {
    const inp = h('input.interruptor', { type: 'checkbox', 'aria-label': mayus(c.etiqueta) });
    inp.checked = valor === 'SÍ';
    inp.addEventListener('change', () => cambio(c.clave));
    const fila = h('label.fila-si-no', h('span', mayus(c.etiqueta)), inp);
    return { el: fila, leer: () => (inp.checked ? 'SÍ' : 'NO'), escribir: (v) => { inp.checked = v === 'SÍ'; } };
  }

  /** Enfoca el siguiente campo de texto visible del formulario; si es el último, cierra el teclado. */
  function siguienteCampo(inp) {
    const todos = [...document.querySelectorAll('input.campo, textarea.campo')]
      .filter((x) => x.offsetParent !== null && !x.disabled && !x.readOnly);
    const sig = todos[todos.indexOf(inp) + 1];
    if (sig) {
      sig.focus();
      try { sig.setSelectionRange(sig.value.length, sig.value.length); } catch (_) {}
      sig.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else inp.blur();
  }

  /** 8.4: fecha escrita con 6 (ddmmaa) u 8 dígitos -> dd/mm/aaaa (igual que Texto.fechaDigitos del núcleo). */
  function fechaDigitos(v) {
    const t = v.trim();
    if (!/^\d{6}$|^\d{8}$/.test(t)) return v;
    const d = +t.slice(0, 2), m = +t.slice(2, 4);
    if (d < 1 || d > 31 || m < 1 || m > 12) return v;
    return t.slice(0, 2) + '/' + t.slice(2, 4) + '/' + (t.length === 6 ? (+t.slice(4) <= (new Date().getFullYear() % 100) + 1 ? '20' : '19') + t.slice(4) : t.slice(4));
  }

  function texto(c, valor, padre) {
    const multi = !!c.multilinea;
    const inp = multi ? h('textarea.campo', { rows: 3 }) : h('input.campo', { type: 'text' });
    inp.value = valor || '';
    inp.setAttribute('autocapitalize', 'characters');
    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('spellcheck', 'false');
    if (c.ayuda) inp.placeholder = mayus(c.ayuda);
    const t = c.teclado;
    if (!multi && t === 'NUMERO') inp.setAttribute('inputmode', 'numeric');
    else if (!multi && t === 'DECIMAL') inp.setAttribute('inputmode', 'decimal');
    else if (!multi && (t === 'BARRA' || t === 'FECHA')) inp.setAttribute('inputmode', 'numeric');
    const filtro = !multi && t === 'NUMERO' ? /[^0-9]/g : !multi && t === 'DECIMAL' ? /[^0-9.,]/g : !multi && (t === 'BARRA' || t === 'FECHA') ? /[^0-9/]/g : null;
    inp.addEventListener('input', () => {
      const pos = inp.selectionStart;
      let v = inp.value;
      if (filtro) v = v.replace(filtro, ''); else v = v.toLocaleUpperCase('es');
      if (!multi && t === 'FECHA') v = fechaDigitos(v);
      if (v !== inp.value) { const largo = inp.value.length; inp.value = v; try { const p2 = t === 'FECHA' ? v.length : pos; inp.setSelectionRange(p2, p2); } catch (_) {} }
      if (multi) autoAlto(inp);
      cambio(c.clave);
    });
    inp.addEventListener('blur', () => actualizarAvance());
    // Versión final: Enter / "Siguiente" pasa siempre al campo siguiente (TA, fechas, laboratorios…)
    if (!multi) {
      inp.setAttribute('enterkeyhint', 'next');
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        siguienteCampo(inp);
      });
    }
    let campoEl = inp;
    if (c.unidad || t === 'BARRA') {
      const extra = [];
      if (t === 'BARRA') extra.push(h('button.barra', { type: 'button', 'aria-label': 'Escribir barra', onclick: () => {
        const p = inp.selectionStart ?? inp.value.length;
        inp.value = inp.value.slice(0, p) + '/' + inp.value.slice(inp.selectionEnd ?? p);
        inp.focus(); try { inp.setSelectionRange(p + 1, p + 1); } catch (_) {}
        cambio(c.clave);
      } }, '/'));
      if (c.unidad) extra.push(h('div.unidad', mayus(c.unidad)));
      campoEl = h('div.con-unidad', inp, ...extra);
    }
    padre.append(campoEl);
    if (multi) requestAnimationFrame(() => autoAlto(inp));
    const escribirV = (v) => { inp.value = v || ''; if (multi) autoAlto(inp); };
    if (c.sugerencias) padre.append(sugerenciasFila(inp, c.sugerencias, multi, c.clave, false, !!c.bloques));
    if (c.catalogoMeds) padre.append(catalogoMeds(inp, c.clave));
    if (c.dinamico) {
      const caja = h('div.dinamicas');
      padre.append(caja);
      actual.dinamicas.push({ c, inp, caja });
    }
    if (c.recordar) {
      actual.recordables.push(c.clave);
      let previos = [];
      try { previos = JSON.parse(Almacen.pref('equipo', c.clave, '[]')); } catch (_) {}
      if (previos.length) padre.append(sugerenciasFila(inp, previos, false, c.clave));
    }
    return { el: inp, leer: () => inp.value, escribir: escribirV };
  }

  function autoAlto(t) { t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight + 2, 84) + 'px'; }

  /**
   * 8.5: botón MEDICAMENTOS con el catálogo por categorías (igual que CatalogoMedsView de Android). Al tocar un medicamento se
   * agrega su línea completa al campo; "+ AGREGAR MEDICAMENTO" guarda uno propio en esa categoría (preferencias "equipo",
   * clave "meds_usuario": viaja en la copia de seguridad); mantener presionado uno propio lo quita.
   */
  function catalogoMeds(inp, clave) {
    const raiz = h('div.catalogo-meds');
    const cuerpo = h('div.cat-cuerpo'); cuerpo.hidden = true;
    const cats = h('div.cat-categorias');
    const lista = h('div.cat-lista');
    let abierta = null, catalogo = null;
    const propios = () => { try { return JSON.parse(Almacen.pref('equipo', 'meds_usuario', '{}')) || {}; } catch (_) { return {}; } };
    const guardarPropios = (o) => Almacen.ponerPref('equipo', { meds_usuario: JSON.stringify(o) });
    const agregarAlCampo = (texto) => {
      const act = inp.value.replace(/\s+$/, '');
      const hay = act.split('\n').map((l) => l.trim().toLowerCase());
      const nuevas = texto.split('\n').map((l) => l.trim()).filter((l) => l && !hay.includes(l.toLowerCase()));
      if (!nuevas.length) return;
      inp.value = act ? act + '\n' + nuevas.join('\n') : nuevas.join('\n');
      autoAlto(inp);
      cambio(clave);
      actualizarAvance();
    };
    function pintarLista() {
      lista.textContent = '';
      const cat = (catalogo || []).find((c) => c.n === abierta);
      if (!cat) return;
      for (const [etq, texto] of cat.m) lista.append(h('button.cat-med', { type: 'button', onclick: () => agregarAlCampo(texto) }, '+ ' + etq));
      for (const p of propios()[cat.n] || []) {
        const b = h('button.cat-med', { type: 'button', onclick: () => agregarAlCampo(p) }, '+ ' + p.replace(/\n/g, ' / '));
        let t = null;
        b.addEventListener('pointerdown', () => { t = setTimeout(async () => {
          if (await confirmar('¿Quitar este medicamento propio?\n\n' + p, 'Quitar')) {
            const o = propios(); o[cat.n] = (o[cat.n] || []).filter((x) => x !== p); await guardarPropios(o); pintarLista();
          }
        }, 650); });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearTimeout(t));
        lista.append(b);
      }
      lista.append(h('button.cat-med.cat-nuevo', { type: 'button', onclick: async () => {
        const nombre = (prompt('Nombre del medicamento (ej: CEFEPIME)') || '').trim();
        if (!nombre) return;
        const dosis = (prompt('Dosificación (ej: 2GR EV CADA 12 HORAS)') || '').trim();
        const o = propios();
        const texto = mayus(dosis ? `${nombre}: ${dosis.replace(/[.\s]+$/, '')}.` : `${nombre}.`);
        o[cat.n] = [...(o[cat.n] || []).filter((x) => x !== texto), texto];
        await guardarPropios(o); pintarLista();
      } }, '+ AGREGAR MEDICAMENTO'));
    }
    function pintarCategorias() {
      cats.textContent = '';
      for (const c of catalogo || []) cats.append(h('button.cat-categoria' + (abierta === c.n ? '.activa' : ''), { type: 'button',
        onclick: () => { abierta = abierta === c.n ? null : c.n; pintarCategorias(); } }, c.n));
      pintarLista();
    }
    const boton = h('button.cat-boton', { type: 'button', onclick: async () => {
      cuerpo.hidden = !cuerpo.hidden;
      if (!cuerpo.hidden) { if (!catalogo) catalogo = await Nucleo.catalogoMeds(); pintarCategorias(); }
    } }, 'MEDICAMENTOS  ▾');
    cuerpo.append(cats, lista);
    raiz.append(boton, cuerpo);
    return raiz;
  }

  /** Botones bajo un campo: en uno de varios renglones agregan un renglón; en uno simple lo reemplazan. */
  function sugerenciasFila(inp, opciones, multilinea, clave, vertical = false, bloques = false) {
    const fila = h(vertical ? 'div.sugerencias.vertical' : 'div.sugerencias');
    for (const o of opciones) {
      fila.append(h('button.sugerencia', { type: 'button', onclick: () => {
        if (!multilinea) inp.value = o;
        else {
          const act = inp.value.replace(/\s+$/, '');
          if (act.split('\n').some((l) => l.trim().toLowerCase() === o.toLowerCase())) return;
          inp.value = act ? act + (bloques ? '\n\n' : '\n') + o : o;
          autoAlto(inp);
        }
        cambio(clave);
        actualizarAvance();
      } }, '+ ' + mayus(vertical ? o : o.split(':')[0])));
    }
    return fila;
  }

  function casillas(c, valor) {
    let desmarcados = valor || '';
    let elementos = [];
    const resumen = h('div.casillas-resumen');
    const lista = h('div.casillas');
    const quitados = () => new Set(desmarcados.split('\n').map((x) => x.trim()).filter(Boolean));
    function refrescar() {
      lista.textContent = '';
      const q = quitados();
      const faltan = elementos.filter((e) => !q.has(e)).length;
      resumen.textContent = !elementos.length ? 'ELIJA LA CIRUGÍA PARA VER LA LISTA'
        : c.casillasAyuda ? `${c.casillasAyuda} · PENDIENTES: ${faltan} DE ${elementos.length}`
        : `TOQUE LO QUE EL PACIENTE YA TIENE PARA QUITARLO · EN LA LISTA: ${faltan} DE ${elementos.length}`;
      for (const e of elementos) {
        const marcado = !q.has(e);
        lista.append(h('button.casilla' + (marcado ? '.marcada' : ''), { type: 'button', onclick: () => {
          const s = quitados();
          if (s.has(e)) s.delete(e); else s.add(e);
          desmarcados = [...s].join('\n');
          refrescar();
          cambio(c.clave);
        } }, (marcado ? '☑  ' : '☐  ') + e));
      }
    }
    actual.casillas.push({ c, poner: (els) => { elementos = els || []; refrescar(); } });
    refrescar();
    return { el: h('div', resumen, lista), leer: () => desmarcados, escribir: (v) => { desmarcados = v || ''; refrescar(); } };
  }

  // ------------------------------------------------------------------ fotos (6.0.1)

  async function procesarFoto(archivo) {
    const url = URL.createObjectURL(archivo);
    try {
      const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
      const mayor = Math.max(img.naturalWidth, img.naturalHeight);
      const esc = mayor > 1600 ? 1600 / mayor : 1;
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.naturalWidth * esc); cv.height = Math.round(img.naturalHeight * esc);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.85));
      const nombre = `F${Date.now()}${Math.floor(Math.random() * 10)}.jpg`;
      await Almacen.guardarFoto(nombre, new Uint8Array(await blob.arrayBuffer()));
      return nombre;
    } catch (_) { return null; } finally { URL.revokeObjectURL(url); }
  }

  function fotos(c, valor) {
    let v = valor || '';
    const fila = h('div.fotos');
    const nombres = () => v.split('\n').map((x) => x.trim()).filter(Boolean);
    async function refrescar() {
      fila.textContent = '';
      for (const n of nombres()) {
        const im = h('button.foto', { type: 'button', 'aria-label': 'Foto ' + n, onclick: async () => {
          if (await confirmar('¿Quitar esta foto?', 'Quitar')) { v = nombres().filter((x) => x !== n).join('\n'); refrescar(); cambio(c.clave); actualizarAvance(); }
        } });
        fila.append(im);
        Almacen.foto(n).then((b) => { if (b) { const u = URL.createObjectURL(new Blob([b], { type: 'image/jpeg' })); im.style.backgroundImage = `url(${u})`; } });
      }
      fila.append(h('button.foto.agregar', { type: 'button', onclick: async () => {
        const archivos = await elegirArchivos('image/*', true);
        if (!archivos.length) return;
        const listo = esperando('Guardando foto…');
        for (const a of archivos) { const n = await procesarFoto(a); if (n) v = [...nombres(), n].join('\n'); }
        listo();
        refrescar(); cambio(c.clave); actualizarAvance();
      } }, '＋\nAGREGAR\nFOTO'));
    }
    refrescar();
    return { el: fila, leer: () => v, escribir: (x) => { v = x || ''; refrescar(); } };
  }

  // ------------------------------------------------------------------ medicamentos del egreso

  function medicamentos(c, valor) {
    const caja = h('div.meds');
    const filas = h('div');
    const lista = [];
    const propios = Almacen.pref('vademecum', 'propios', '[]');
    const datalist = h('datalist', { id: 'vademecum-' + c.clave });
    Nucleo.vademecumNombres(propios).then((ns) => {
      for (const n of ns) datalist.append(h('option', { value: n }));
      const frec = h('div.sugerencias');
      for (const n of ns.slice(0, 30)) frec.append(h('button.sugerencia', { type: 'button', onclick: async () => {
        const i = await Nucleo.vademecumBuscar(n, propios);
        agregar(n, i ? i.presentacion : '', i ? i.indicacion : '', false);
      } }, mayus(n)));
      caja.append(h('div.etiqueta-suave', 'FRECUENTES (TOQUE PARA AGREGAR)'), frec);
    });
    function numerar() { lista.forEach((f, i) => { f.num.textContent = String(i + 1); }); }
    function agregar(nombre, pres, ind, enfocar) {
      const n = h('input.campo.med-nombre', { type: 'text', placeholder: 'MEDICAMENTO', list: datalist.id });
      n.setAttribute('list', datalist.id);
      n.setAttribute('autocapitalize', 'characters');
      n.value = nombre;
      const p = h('input.campo', { type: 'text', placeholder: 'PRESENTACIÓN (EJ: TAB 500MG)' }); p.value = pres;
      const i = h('textarea.campo', { rows: 2, placeholder: 'INDICACIÓN (EJ: TOMAR 01 TABLETA CADA 8 HORAS POR 7 DÍAS)' }); i.value = ind;
      for (const x of [n, p, i]) { x.setAttribute('autocapitalize', 'characters'); x.addEventListener('input', () => { const pos = x.selectionStart; const u = x.value.toLocaleUpperCase('es'); if (u !== x.value) { x.value = u; try { x.setSelectionRange(pos, pos); } catch (_) {} } cambio(c.clave); }); }
      const num = h('div.med-num');
      const f = { num, n, p, i, el: null };
      const completar = async () => {
        const r = await Nucleo.vademecumBuscar(n.value, propios);
        if (!r) return;
        if (!p.value.trim()) p.value = r.presentacion;
        if (!i.value.trim()) i.value = r.indicacion;
        cambio(c.clave);
      };
      n.addEventListener('change', completar);
      n.addEventListener('blur', completar);
      f.el = h('div.med', h('div.med-arriba', num, n, h('button.quitar', { type: 'button', 'aria-label': 'Quitar medicamento', onclick: () => {
        f.el.remove(); lista.splice(lista.indexOf(f), 1); numerar(); cambio(c.clave);
      } }, icono('cerrar'))), p, i);
      lista.push(f);
      filas.append(f.el);
      numerar();
      if (enfocar) n.focus();
      cambio(c.clave);
    }
    const leerM = () => lista.map((f) => {
      const nm = f.n.value.trim();
      return nm ? [nm, f.p.value.trim(), f.i.value.trim().replace(/\n/g, ' ')].join('|') : null;
    }).filter(Boolean).join('\n');
    const poner = (v) => {
      filas.textContent = ''; lista.length = 0;
      for (const l of (v || '').replace(/\r/g, '').split('\n')) {
        const x = l.split('|');
        if ((x[0] || '').trim()) agregar(x[0].trim(), (x[1] || '').trim(), (x[2] || '').trim(), false);
      }
    };
    caja.append(datalist, filas, boton('Agregar medicamento', 'mas', 'marino', () => agregar('', '', '', true)));
    const sinCambio = actual.sucio;
    poner(valor);
    actual.sucio = sinCambio;
    return { el: caja, leer: leerM, escribir: poner };
  }

  // ------------------------------------------------------------------ construcción

  function agregarCampo(padre, c, guardados) {
    const st = actual;
    let destino = padre;
    if (c.visibleSi) {
      destino = h('div.grupo-dependiente');
      padre.append(destino);
      st.dependientes.push({ expr: c.visibleSi, grupo: destino });
    }
    const valor = guardados[c.clave] != null ? guardados[c.clave] : (c.clave === 'NOM1' && guardados.NOMBRE != null ? guardados.NOMBRE : valorPorDefecto(c));
    if (c.siNo) { const w = interruptor(c, valor); destino.append(w.el); st.campos.set(c.clave, w); return; }
    destino.append(etiqueta(c.etiqueta));
    let w;
    if (c.casillas) w = casillas(c, valor);
    else if (c.compartir) {
      destino.append(boton(c.etiqueta, 'compartir', 'cian ancho', async () => {
        const v = paraNucleo();
        const t = await Nucleo.compartir(st.mod, c.clave, v);
        // 8.1: los Word que van con el mensaje (lista de materiales y, si aplica, informe médico)
        const adjs = c.adjunto ? (await Nucleo.adjunto(st.mod, c.clave, v)) || [] : [];
        if (adjs.length) {
          const listo = esperando('Preparando los documentos…');
          const archivos = [];
          try {
            for (const adj of adjs) {
              try {
                const datos = await Nucleo.datos(adj.modulo, adj.valores, {});
                const pl = await Nucleo.plantilla(adj.modulo, adj.valores);
                archivos.push({ blob: new Blob([deBase64(await Nucleo.documento(adj.modulo, datos, pl))], { type: MIME_DOCX }), nombre: adj.nombre });
              } catch (e) { /* se omite ese documento */ }
            }
          } finally { listo(); }
          if (archivos.length) { await enviarConAdjunto(t, archivos, c.telefono ? leer(c.telefono) : ''); return; }
        }
        compartirTexto(t, c.telefono ? leer(c.telefono) : '');
      }));
      return;
    } else if (c.salida && st.modulo.extra) {
      const x = st.modulo.extra;
      destino.append(boton(`Generar ${x.boton.toLowerCase()} (${x.extension.toUpperCase()})`, 'compartir', 'marino ancho', opcionesSalida));
      return;
    } else if (c.fotos) w = fotos(c, valor);
    else if (c.medicamentos) w = medicamentos(c, valor);
    else if (c.opciones) w = chips(c, valor);
    else { w = texto(c, valor, destino); st.campos.set(c.clave, w); return; }
    destino.append(w.el);
    st.campos.set(c.clave, w);
  }

  function construirSeccion(sec, indice, guardados, numero, pestana) {
    const st = actual;
    const cuerpo = h('div.seccion-cuerpo');
    const badge = insignia(String(numero), 'numero');
    const flecha = h('span.flecha', '▾');
    const tituloCorto = mayus(sec.titulo).startsWith('PARTE') && sec.titulo.includes(' - ') ? sec.titulo.slice(sec.titulo.indexOf(' - ') + 3) : sec.titulo;
    const enc = h('button.seccion-enc', { type: 'button' }, badge, h('span.seccion-titulo', mayus(tituloCorto)), flecha);
    enc.addEventListener('click', () => {
      const abrir = cuerpo.hidden;
      cuerpo.hidden = !abrir;
      flecha.textContent = abrir ? '▾' : '▸';
      actualizarAvance();
    });
    const tarjeta = h('section.seccion', enc, cuerpo);
    const todos = [...sec.antes, ...sec.ayudas, ...sec.campos, ...sec.despues];
    const iniciales = {};
    for (const c of todos) iniciales[c.clave] = valorPorDefecto(c);
    // 8.3: visibleSi = la tarjeta completa solo aparece cuando se cumple su condición (ej. SEXO=FEMENINO); "oculta" es aparte de
    // la visibilidad por pestaña (mostrarPestana)
    st.secciones.push({ tarjeta, badge, numero, claves: todos.map((c) => c.clave), iniciales, pestana, visibleSi: sec.visibleSi || '', oculta: false });

    if (sec.accion && sec.autoSegun) (st.automaticos = st.automaticos || []).push({ indice, claves: sec.autoSegun.split(',').map((x) => x.trim()) });
    for (const c of sec.antes) agregarCampo(cuerpo, c, guardados);
    if (sec.tituloAyudas) cuerpo.append(h('div.titulo-ayudas', mayus(sec.tituloAyudas)));
    for (const c of sec.ayudas) agregarCampo(cuerpo, c, guardados);
    if (sec.accion) {
      cuerpo.append(h('button.pildora', { type: 'button', onclick: async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        try {
          const res = await Nucleo.accion(st.mod, indice, paraNucleo());
          for (const [k, v] of Object.entries(res || {})) { escribir(k, v); st.generados[k] = v; }
          actualizarAvance();
          aplicarDependencias();
          aviso('Listo. Puede editar el texto antes de exportar.');
          cambio('__accion__');
          refrescarDinamicas(null);
        } catch (err) { aviso('No se pudo generar: ' + err.message, true); } finally { b.disabled = false; }
      } }, mayus(sec.accion)));
    }
    for (const c of sec.campos) agregarCampo(cuerpo, c, guardados);
    for (const c of sec.despues) agregarCampo(cuerpo, c, guardados);
    return tarjeta;
  }

  // ------------------------------------------------------------------ dependencias y sugerencias dinámicas

  function cumple(expr) {
    if (expr.includes('|')) return expr.split('|').some(cumple);
    if (expr.includes('&')) return expr.split('&').every(cumple);
    const k = expr.split('!=')[0].split('=')[0].split('~')[0];
    const v = leer(k);
    if (expr.includes('!=')) return v.trim() !== '' && v !== 'NO EVALUADO' && v !== expr.slice(expr.indexOf('!=') + 2);
    if (expr.includes('=')) return v === expr.slice(expr.indexOf('=') + 1);
    if (expr.includes('~')) return v.toLowerCase().includes(expr.slice(expr.indexOf('~') + 1).toLowerCase());
    return v === 'SÍ';
  }
  function aplicarDependencias() {
    for (const d of actual.dependientes) d.grupo.hidden = !cumple(d.expr);
    let hubo = false;
    for (const s of actual.secciones) {
      if (!s.visibleSi) continue;
      const oculta = !cumple(s.visibleSi);
      if (oculta !== s.oculta) { s.oculta = oculta; hubo = true; }
      s.tarjeta.hidden = s.oculta || s.pestana !== actual.actual;
    }
    if (hubo && actual.avanceTexto) actualizarAvance();
  }

  async function refrescarDinamicas(clave) {
    const st = actual;
    const toca = (segun) => clave == null || (segun || '').split(',').map((x) => x.trim()).includes(clave);
    const v = paraNucleo();
    for (const x of st.casillas) if (toca(x.c.segunCampo)) x.poner(await Nucleo.sugerencias(st.mod, x.c.clave, v));
    for (const d of st.dinamicas) if (toca(d.c.segunCampo)) {
      const ops = await Nucleo.sugerencias(st.mod, d.c.clave, v);
      d.caja.textContent = '';
      if (ops && ops.length) d.caja.append(h('div.etiqueta-suave', 'TOQUE PARA AGREGAR'), sugerenciasFila(d.inp, ops, !!d.c.multilinea, d.c.clave, true, !!d.c.bloques));
    }
  }

  /** 8.1: secciones con autoSegun: al cambiar esos campos se rehace el texto generado (si no se editó a mano). */
  async function automaticos(clave) {
    const st = actual;
    for (const a of st.automaticos || []) {
      if (!a.claves.includes(clave)) continue;
      const res = await Nucleo.accion(st.mod, a.indice, paraNucleo());
      if (st !== actual) return;
      for (const [k, v] of Object.entries(res || {})) {
        const ahora = leer(k);
        if (!ahora.trim() || ahora === st.generados[k]) { escribir(k, v); st.generados[k] = v; }
      }
    }
  }

  /** Pared abdominal: al cambiar el tipo de hernia se cargan sus medicamentos, salvo los que se cambiaron a mano. */
  async function ordenesHernia() {
    const st = actual;
    const nuevo = leer('her_tipo');
    const n = (t) => mayus((t || '').trim().replace(/[.,; ]+$/, '')) || 'HERNIA INGUINAL';
    if (n(nuevo) === n(st.herAnterior)) return;
    const viejos = await Nucleo.ordenesHernia(st.herAnterior);
    const nuevos = await Nucleo.ordenesHernia(nuevo);
    // 8.5: los medicamentos son una sola lista (MED1)
    const m1 = leer('MED1').trim();
    if (m1 === viejos.slice(0, 5).join('\n').trim() || m1 === viejos.join('\n').trim()) escribir('MED1', nuevos.join('\n'));
    st.herAnterior = nuevo;
  }

  // ------------------------------------------------------------------ avance

  function seccionCompleta(s) {
    return s.claves.some((k) => { const v = leer(k).trim(); return v && v !== 'NO' && v !== (s.iniciales[k] || '').trim(); });
  }
  function actualizarAvance() {
    const st = actual;
    if (!st) return;
    let hechas = 0;
    const por = st.pestanas.map(() => 0), tot = st.pestanas.map(() => 0);
    const visibles = st.secciones.filter((s) => !s.oculta);   // las que no aplican (visibleSi) no cuentan
    for (const s of visibles) {
      const ok = seccionCompleta(s);
      if (ok) { hechas++; por[s.pestana]++; }
      tot[s.pestana]++;
      s.badge.textContent = ok ? '✓' : String(s.numero);
      s.badge.classList.toggle('hecha', ok);
    }
    st.pestanas.forEach((p, i) => { if (p.contador) { p.contador.textContent = `${por[i]}/${tot[i]}`; p.contador.classList.toggle('completo', tot[i] > 0 && por[i] === tot[i]); } });
    st.barra.style.width = (visibles.length ? (100 * hechas / visibles.length) : 0) + '%';
    st.avanceTexto.textContent = `${hechas} DE ${visibles.length} SECCIONES`;
  }
  function actualizarCabecera() {
    const n = nombreCompleto();
    actual.nombreEl.textContent = n || 'PACIENTE SIN NOMBRE';
    actual.nombreEl.classList.toggle('sin-nombre', !n);
  }

  function mostrarPestana(i) {
    const st = actual;
    if (!st.pestanas.length) return;
    const nueva = Math.max(0, Math.min(i, st.pestanas.length - 1));
    st.pestanas[st.actual].desplazamiento = st.scroll.scrollTop;
    st.actual = nueva;
    for (const s of st.secciones) s.tarjeta.hidden = !!s.oculta || s.pestana !== nueva;
    st.pestanas.forEach((p, k) => { p.pie.hidden = k !== nueva; p.celda.classList.toggle('activa', k === nueva); });
    st.botonVista.querySelector('.fl-texto').textContent = `VISTA PREVIA · HOJA ${st.pestanas[nueva].hoja}`;
    st.scroll.scrollTop = st.pestanas[nueva].desplazamiento;
    requestAnimationFrame(() => ajustarTextos(st.scroll));
    st.pestanas[nueva].celda.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  // ------------------------------------------------------------------ guardar

  async function eliminarElectivo() {
    const st = actual;
    if (!st) return;
    const n = nombreCompleto() || 'este paciente';
    if (!await confirmar(`¿Eliminar la ficha de ${n}? Si tiene fecha de cirugía, también sale de la agenda. Esta acción no se puede deshacer.`, 'Eliminar', 'Eliminar paciente electivo')) return;
    clearTimeout(st.temporizador);
    st.borrado = true;
    await Almacen.borrar(st.id);
    actual = null;
    App.cerrarEditor();
    aviso('Paciente electivo eliminado');
  }

  function guardar() {
    const st = actual;
    if (!st || st.borrado || !st.campos.size) return false;
    const actuales = getterValores();
    if (!Almacen.existe(st.id) && !nombreCompleto() && JSON.stringify(actuales) === st.valoresIniciales) return false;
    const datos = valoresActuales();
    for (const [k, v] of Object.entries(st.generados)) datos[Almacen.GEN + k] = v;
    // 8.3: abrir un documento sin cambiar nada no lo reescribe (su fecha de modificación decide qué versión gana al sincronizar)
    const previo = Almacen.cargar(st.id);
    const igual = Almacen.existe(st.id) && Object.keys(datos).length === Object.keys(previo).length && Object.keys(datos).every((k) => previo[k] === datos[k]);
    if (!igual) Almacen.guardar(st.id, datos);
    for (const k of st.recordables) {
      const v = mayus(leer(k).trim());
      if (!v) continue;
      let l = [];
      try { l = JSON.parse(Almacen.pref('equipo', k, '[]')); } catch (_) {}
      l = [v, ...l.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 8);
      Almacen.ponerPref('equipo', { [k]: JSON.stringify(l) });
    }
    st.sucio = false;
    return true;
  }

  // ------------------------------------------------------------------ documento

  async function construirDocx() {
    const st = actual;
    const datos = await Nucleo.datos(st.mod, valoresActuales(), st.generados);
    const pl = await Nucleo.plantilla(st.mod, valoresActuales());
    const b64 = await Nucleo.documento(st.mod, datos, pl);
    if (st.mod === 'EGRESO') {
      const nuevos = await Nucleo.vademecumRecordar(Almacen.pref('vademecum', 'propios', '[]'), datos.MEDS || '');
      Almacen.ponerPref('vademecum', { propios: nuevos });
    }
    return new Blob([deBase64(b64)], { type: MIME_DOCX });
  }
  const tieneSexo = () => actual.campos.has('SEXO');
  async function generarDocx() {
    if (tieneSexo() && !leer('SEXO').trim()) { aviso('Seleccione el sexo del paciente antes de generar el documento', true); return null; }
    guardar();
    const listo = esperando('Generando el Word…');
    try { return await construirDocx(); } catch (e) { aviso('Error al generar el documento: ' + e.message, true); return null; } finally { listo(); }
  }
  const nombreDocx = () => NombreArchivo.armar(actual.mod, nombreCompleto(), (k) => (actual.campos.has(k) ? leer(k) : ''), actual.modulo.nombre);

  async function vistaPrevia(hoja) {
    guardar();
    const listo = esperando('Generando la vista previa…');
    let blob;
    try { blob = await construirDocx(); } catch (e) { listo(); aviso('No se pudo generar la vista previa', true); return; }
    listo();
    const avisoSexo = tieneSexo() && !leer('SEXO').trim()
      ? 'FALTA SELECCIONAR EL SEXO DEL PACIENTE (PESTAÑA PACIENTE). SIN ESE DATO NO SE PUEDE EXPORTAR EL WORD.' : null;
    VistaPrevia.mostrar(blob, hoja, avisoSexo, nombreDocx());
  }

  async function opcionesSalida() {
    const st = actual;
    const x = st.modulo.extra;
    guardar();
    const w = await elegir(x.boton, esWindows ? ['Abrir', 'Guardar en la computadora'] : ['Compartir o abrir', 'Guardar en Archivos']);
    if (w < 0) return;
    const listo = esperando('Generando la ' + x.boton.toLowerCase() + '…');
    let blob;
    try {
      const datos = await Nucleo.datos(st.mod, valoresActuales(), st.generados);
      const fotosMapa = {};
      for (const k of Object.keys(datos)) if (k.startsWith('FOTO_')) for (const n of (datos[k] || '').split('\n').map((s) => s.trim()).filter(Boolean)) {
        const b = await Almacen.foto(n);
        if (b) fotosMapa[n] = aBase64(b);
      }
      blob = new Blob([deBase64(await Nucleo.salida(st.mod, datos, x.plantilla, fotosMapa))], { type: x.mime });
    } catch (e) { aviso('No se pudo generar: ' + e.message, true); return; } finally { listo(); }
    const nombre = NombreArchivo.armar(st.mod, nombreCompleto(), (k) => (st.campos.has(k) ? leer(k) : ''), st.modulo.nombre, x.extension, x.prefijo.replace(/_/g, ' ').replace('CLINICO', 'CLÍNICO'));
    if (w === 0) abrirArchivo(blob, nombre); else descargar(blob, nombre);
  }

  // ------------------------------------------------------------------ pantalla

  async function abrir({ id, tipo }) {
    const guardados = id && Almacen.existe(id) ? Almacen.cargar(id) : {};
    const nuevaHistoria = !id;
    id = id || Almacen.nuevoId();
    const mod = tipo || guardados.TIPO || 'APENDICITIS';
    const modulo = App.modulo(mod);
    const lista = await Nucleo.esquema(mod);
    const st = {
      id, mod, modulo, campos: new Map(), secciones: [], pestanas: [], actual: 0, dependientes: [], dinamicas: [], casillas: [],
      recordables: [], generados: {}, sucio: false, herAnterior: guardados.her_tipo || '',
    };
    for (const [k, v] of Object.entries(guardados)) if (k.startsWith(Almacen.GEN)) st.generados[k.slice(Almacen.GEN.length)] = v;
    actual = st;

    const pantalla = h('div.editor');
    // cabecera
    st.nombreEl = h('div.ed-nombre');
    const cab = h('header.ed-cabecera',
      h('div.ed-barra',
        h('button.ed-atras', { type: 'button', 'aria-label': 'Volver', onclick: () => cerrar() }, icono('atras')),
        h('div.ed-titulos', st.nombreEl, h('div.ed-modulo', mayus((nuevaHistoria ? 'Nueva historia · ' : '') + modulo.nombre))),
        boton('Guardar', 'guardar', 'cian chico', () => aviso(guardar() ? 'Historia guardada' : 'No hay datos para guardar todavía'))),
      h('div.ed-avance', h('div.ed-pista', st.barra = h('div.ed-relleno')), st.avanceTexto = h('div.ed-avance-texto')),
      st.tira = h('nav.ed-pestanas'));
    pantalla.append(cab);
    const pestanaDe = lista.map((s) => pestanaPara(st, s.titulo, s.pestana, s.hoja));
    st.pestanas.forEach((p, i) => {
      p.contador = h('span.contador');
      p.celda = h('button.pestana', { type: 'button', onclick: () => mostrarPestana(i) }, h('span', p.nombre), p.contador);
      st.tira.append(p.celda);
    });
    st.scroll = h('main.ed-cuerpo');
    const cont = h('div.ed-contenido');
    st.scroll.append(cont);
    lista.forEach((s, n) => cont.append(construirSeccion(s, n, guardados, n + 1, pestanaDe[n])));
    st.pestanas.forEach((p, i) => {
      p.pie = h('div.pie-pestana',
        i > 0 ? boton('Anterior', 'atras', 'blanco', () => mostrarPestana(i - 1)) : null,
        i < st.pestanas.length - 1 ? boton('Siguiente: ' + st.pestanas[i + 1].nombre, 'siguiente', 'marino grande', () => mostrarPestana(i + 1))
          : boton('Vista previa completa', 'ver', 'cian grande', () => vistaPrevia(1)));
      cont.append(p.pie);
    });
    // 8.2: el paciente electivo se puede eliminar desde su propia ficha (primera pestaña); su cirugía sale de la agenda
    if (Carpetas.ELECTIVOS.includes(mod) && st.pestanas.length) {
      st.pestanas[0].pie.append(h('div.eliminar-fila', boton('Eliminar paciente electivo', 'cerrar', 'peligro ancho', eliminarElectivo)));
    }
    st.botonVista = h('button.flotante', { type: 'button', onclick: () => vistaPrevia(st.pestanas[st.actual].hoja) }, icono('ver'), h('span.fl-texto', 'VISTA PREVIA'));
    pantalla.append(st.scroll, st.botonVista);
    pantalla.append(h('footer.ed-pie',
      boton(esWindows ? 'Abrir en Word' : 'Abrir', 'abrir', 'blanco', async () => { const b = await generarDocx(); if (b) abrirArchivo(b, nombreDocx()); }),
      boton('Compartir', 'compartir', 'cian', async () => { const b = await generarDocx(); if (b) compartirArchivo(b, nombreDocx()); }),
      boton('Descargar', 'descargar', 'blanco', async () => { const b = await generarDocx(); if (b) { descargar(b, nombreDocx()); if (!enAppWindows && !esIOS) aviso('Descargado: ' + nombreDocx(), true); } })));

    App.mostrarEditor(pantalla);
    st.valoresIniciales = JSON.stringify(getterValores());
    aplicarDependencias();
    await refrescarDinamicas(null);
    st.sucio = false;
    actualizarCabecera();
    mostrarPestana(0);
    actualizarAvance();
  }

  function cerrar() {
    if (!actual) return;
    clearTimeout(actual.temporizador);
    guardar();
    actual = null;
    App.cerrarEditor();
  }

  // Al salir de la app (cambiar de app en el iPhone, cerrar la ventana en Windows) se guarda.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && actual) guardar(); });
  window.addEventListener('pagehide', () => { if (actual) guardar(); });

  return { abrir, cerrar, guardar, abierto: () => !!actual };
})();
