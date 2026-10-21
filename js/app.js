// 7.0: pantalla principal (igual que MainActivity de Android): Inicio, Pacientes, Agenda, Formatos y Ajustes.
const App = (() => {
  let modulos = [];
  let actual = 0;
  let carpetaAbierta = null;
  let filtroTexto = '';
  let filtroTipo = null;
  let diaAgenda = Fecha.hoy();
  let mesAgenda = (() => { const d = new Date(); d.setDate(1); return d; })();
  let pantalla, contenedor, barra, fab, capaEditor;

  const modulo = (id) => modulos.find((m) => m.id === id) || modulos[0];
  const HISTORIAS = () => modulos.filter((m) => !m.seguimiento);
  const SEGUIMIENTO = () => modulos.filter((m) => m.seguimiento);
  const segPorIds = (ids) => ids.map((id) => modulos.find((m) => m.id === id && m.seguimiento)).filter(Boolean);
  const grupos = () => [
    ['Emergencia · nuevo ingreso', HISTORIAS()],
    ['Hospitalización', segPorIds(Carpetas.HOSPITALIZACION)],
    ['Documentos', segPorIds(Carpetas.DOCUMENTOS)],
    ['Electivos', segPorIds(Carpetas.ELECTIVOS)],
  ];

  // ------------------------------------------------------------------ navegación

  function mostrar(i) {
    actual = i;
    if (i !== 1) carpetaAbierta = null;
    pantalla.textContent = '';
    if (i === 0) inicio();
    else if (i === 1) {
      if (carpetaAbierta && Carpetas.agrupar(Almacen.listar()).some((c) => c.clave === carpetaAbierta)) carpeta(carpetaAbierta);
      else { carpetaAbierta = null; pacientes(); }
    } else if (i === 2) agenda();
    else if (i === 3) formatos();
    else ajustes();
    fab.hidden = i > 2;
    requestAnimationFrame(() => ajustarTextos(pantalla));
    barra.querySelectorAll('.nav-item').forEach((b, k) => b.classList.toggle('activo', k === i));
    contenedor.scrollTop = 0;
  }

  const abrirHistoria = (id) => Editor.abrir({ id });
  const nuevaHistoria = (tipo) => Editor.abrir({ tipo });

  function mostrarEditor(el) {
    capaEditor.textContent = '';
    capaEditor.append(el);
    capaEditor.hidden = false;
    document.body.classList.add('con-editor');
  }
  function cerrarEditor() {
    capaEditor.hidden = true;
    capaEditor.textContent = '';
    document.body.classList.remove('con-editor');
    mostrar(actual);
    sincronizarPronto();
  }

  // ------------------------------------------------------------------ CUENTA DE GOOGLE (8.3, app de Windows)

  let temporizadorSync = null;
  /** Sincroniza en segundo plano; avisar = mostrar el resultado (botón de Ajustes). Redibuja solo si los datos cambiaron. */
  async function sincronizarFondo(avisar = false) {
    if (!Nube.disponible() || !Nube.cuenta()) return;
    if (avisar && Nube.necesitaReconectar()) { reconectar(); return; }
    // Con un documento abierto no se sincroniza: lo bajado de Drive se reemplazaría por la versión del formulario al autoguardar.
    // Se sincroniza al cerrar el documento (cerrarEditor).
    if (Editor.abierto()) { if (avisar) aviso('Cierre el documento para sincronizar', true); return; }
    const r = await Nube.sincronizar();
    if (avisar) aviso(r.ok ? 'Sincronizado' : 'No se pudo sincronizar: ' + (r.error === 'reconectar' ? 'hay que entrar de nuevo con Google' : r.error), true);
    if ((avisar || r.cambio || Nube.necesitaReconectar()) && !Editor.abierto()) mostrar(actual);
  }
  /** Tras guardar un documento: se espera unos segundos para no sincronizar a cada tecla. */
  function sincronizarPronto() {
    if (!Nube.disponible() || !Nube.cuenta()) return;
    clearTimeout(temporizadorSync);
    temporizadorSync = setTimeout(() => sincronizarFondo(), 4000);
  }

  let capaLogin = null;
  function mostrarLogin() {
    if (capaLogin) return;
    const error = h('p.login-error', { hidden: true });
    const continuar = h('button.boton.cian.ancho', { type: 'button', onclick: async () => { await Nube.omitir(); quitarLogin(); mostrar(actual); } }, h('span', 'Continuar'));
    const boton = h('button.boton.marino.ancho', { type: 'button', onclick: async () => {
      boton.disabled = true; error.hidden = true;
      boton.querySelector('span').textContent = 'Esperando a Google…';
      const r = await Nube.entrar();
      boton.disabled = false; boton.querySelector('span').textContent = 'Continuar con Google Drive';
      if (r.error) { error.textContent = r.error; error.hidden = false; return; }
      confirmarCuenta(r.correo, r.token);
    } }, h('span', 'Continuar con Google Drive'));
    capaLogin = h('div.login',
      h('div.logo.grande', h('img', { src: 'iconos/logo.svg', alt: '' })),
      h('div.arranque-t', INSTITUCION.nombreApp),
      h('p.login-texto', 'Use la app de forma normal, con sus pacientes solo en este equipo, o conéctela con su cuenta de Google Drive para ver los mismos pacientes en cualquier equipo.'),
      continuar, h('div.login-sep'), boton, error);
    document.body.append(capaLogin);
  }
  function quitarLogin() { if (capaLogin) { capaLogin.remove(); capaLogin = null; } }

  /** Si este equipo tenía pacientes de otra cuenta, se pregunta antes de mezclarlos con la nueva. */
  async function confirmarCuenta(correo, token) {
    const anterior = Nube.cuentaAnterior();
    const n = Almacen.listar().length;
    if (anterior && anterior.toLowerCase() !== correo.toLowerCase() && n > 0) {
      const w = await dialogo('Otra cuenta de Google',
        `Este equipo tiene ${n} documentos de ${anterior} y usted entró con ${correo}.\n\n¿Qué desea hacer?`,
        ['Combinarlos', 'Borrar los de este equipo'], { lista: true });
      if (w < 0) return;
      if (w === 1) await Almacen.limpiarLocal();
    }
    const listo = esperando('Sincronizando…');
    const ok = await Nube.completarInicio(correo, token);
    listo();
    quitarLogin();
    aviso(ok ? 'Sesión iniciada: ' + correo : 'Sesión iniciada. No se pudo sincronizar ahora; se intentará de nuevo.', true);
    mostrar(actual);
  }

  /** Google pide el permiso otra vez: se vuelve a abrir el navegador. */
  async function reconectar() {
    const r = await Nube.entrar();
    if (r.error) { aviso(r.error, true); return; }
    confirmarCuenta(r.correo, r.token);
  }

  // ------------------------------------------------------------------ piezas

  const cabecera = (titulo, sub) => h('header.cabecera', h('div.cab-sub', sub), h('div.cab-titulo', titulo));
  const cuerpo = () => h('div.cuerpo');
  function subtitulo(t, accion) {
    return h('div.subtitulo', h('span', mayus(t)), accion ? h('button.enlace', { type: 'button', onclick: accion[1] }, mayus(accion[0])) : null);
  }
  const tarjeta = (...hijos) => h('div.tarjeta', ...hijos);
  const dato = (t, v) => h('div.dato', h('div.dato-t', mayus(t)), h('div.dato-v', v));
  const vacio = (t) => h('div.vacio', t);

  // ------------------------------------------------------------------ INICIO

  function inicio() {
    const todas = Almacen.listar();
    const firma = Preferencias.firma();
    const hoyTxt = Fecha.dmaCorto(new Date());
    const cab = h('header.cabecera',
      h('div.cab-fila', h('div.logo', h('img', { src: 'iconos/logo.svg', alt: '' })),
        h('div', h('div.cab-titulo.chico', INSTITUCION.nombreApp), h('div.cab-sub', firma ? `${firma} · CIRUGÍA GENERAL` : 'CIRUGÍA GENERAL'))),
      h('div.datos', dato('Hoy', Fecha.corto(new Date())), dato('Ingresos hoy', String(todas.filter((r) => r.fecha.trim() === hoyTxt).length)),
        dato('Pacientes', String(Carpetas.agrupar(todas).length))));
    pantalla.append(cab);
    const c = cuerpo();

    if (Nube.disponible() && Nube.cuenta() && Nube.necesitaReconectar()) {
      c.append(h('button.recordatorio', { type: 'button', onclick: reconectar },
        'SU CUENTA DE GOOGLE NECESITA CONECTARSE DE NUEVO Y SUS PACIENTES NO SE ESTÁN SINCRONIZANDO.\nTOQUE AQUÍ PARA RECONECTAR.'));
    }

    const dias = Copia.diasSinCopia();
    if (todas.length && (dias == null || dias >= 7)) {
      c.append(h('button.recordatorio', { type: 'button', onclick: guardarCopia },
        (dias == null ? 'AÚN NO HA GUARDADO UNA COPIA DE SEGURIDAD.' : `HACE ${dias} DÍAS DE SU ÚLTIMA COPIA DE SEGURIDAD.`) +
        (esWindows ? '\nTOQUE AQUÍ PARA GUARDARLA (USB, ONEDRIVE O GOOGLE DRIVE).' : '\nTOQUE AQUÍ PARA GUARDARLA EN ARCHIVOS O GOOGLE DRIVE.')));
    }

    const hoyEv = Agenda.delDia(Fecha.hoy()), mananaEv = Agenda.delDia(Fecha.manana());
    if (hoyEv.length || mananaEv.length) {
      c.append(subtitulo('Agenda', ['Ver agenda', () => mostrar(2)]));
      const t = tarjeta();
      for (const [cuando, l] of [['HOY', hoyEv], ['MAÑANA', mananaEv]]) if (l.length) {
        t.append(h('div.etiqueta-suave', cuando));
        for (const e of l) t.append(filaEvento(e, true));
      }
      c.append(t);
    }

    if (todas[0]) {
      const r = todas[0];
      c.append(subtitulo('Continuar'));
      c.append(h('button.continuar', { type: 'button', onclick: () => abrirHistoria(r.id) },
        insigniaIcono(info(r.tipo).icono, 'marino-claro'),
        h('div.textos', h('div.t1', r.nombre), h('div.t2', `${mayus(modulo(r.tipo).nombre)} · EDITADA ${mayus(Fecha.haceCuanto(r.modificado))}`)),
        icono('siguiente', 'cian')));
    }

    c.append(subtitulo('Emergencia · nuevo ingreso', ['Ver formatos', () => mostrar(3)]));
    const rej = h('div.rejilla3');
    for (const m of HISTORIAS()) {
      const f = info(m.id);
      rej.append(h('button.mosaico', { type: 'button', 'aria-label': 'Nueva historia de ' + m.nombre, onclick: () => nuevaHistoria(m.id) },
        insigniaIcono(f.icono, 'marino'), h('div.m-t.ajustar', { 'data-grupo': 'emergencia' }, f.corto)));
    }
    c.append(rej);
    c.append(subtitulo('Hospitalización'), rejillaSeguimiento(Carpetas.HOSPITALIZACION));
    c.append(subtitulo('Documentos'), rejillaSeguimiento(Carpetas.DOCUMENTOS));
    c.append(subtitulo('Electivos'), rejillaSeguimiento(Carpetas.ELECTIVOS));

    const electivos = todas.filter((r) => Carpetas.ELECTIVOS.includes(r.tipo));
    if (electivos.length) {
      const cuenta = new Map();
      for (const r of electivos) { const e = (Almacen.cargar(r.id).el_estado || '').trim() || 'EN PREPARACIÓN'; cuenta.set(e, (cuenta.get(e) || 0) + 1); }
      c.append(h('button.enlace.estados', { type: 'button', onclick: () => { filtroTipo = 'ELECTIVOS'; mostrar(1); } },
        [...cuenta.entries()].map(([k, v]) => `${v} ${k}`).join('  ·  ')));
    }
    const qx = Agenda.cirugias().filter((e) => e.fecha >= Fecha.hoy()).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    if (qx.length) {
      c.append(h('div.etiqueta-suave.margen', 'PRÓXIMAS CIRUGÍAS'));
      for (const e of qx.slice(0, 5)) c.append(filaEvento(e, false));
    }

    const carpetas = Carpetas.agrupar(todas);
    if (carpetas.length) {
      c.append(subtitulo('Pacientes recientes', ['Ver todos', () => mostrar(1)]));
      for (const cp of carpetas.slice(0, 3)) c.append(tarjetaCarpeta(cp));
    } else {
      c.append(vacio('AÚN NO HAY PACIENTES GUARDADOS.\nElija un formato arriba o toque NUEVO.'));
    }
    pantalla.append(c);
  }

  /** 7.1: nombre de cada formato en los botones del Inicio (solo el nombre, sin descripción). */
  const TITULOS = {
    NOTA: 'NOTA OPERATORIA', EVOLUCION: 'EVOLUCIÓN Y ÓRDENES MÉDICAS', PROCEDIMIENTO: 'PROCEDIMIENTOS', CURVAS: 'CURVAS',
    NPT: 'NUTRICIÓN PARENTERAL', EGRESO: 'EGRESOS', RESP_IC: 'RESPUESTA DE INTERCONSULTAS', NOTA_CG: 'NOTAS DE CIRUGÍA GENERAL',
    SOLICITUDES: 'SOLICITUDES', CONSENTIMIENTO: 'CONSENTIMIENTOS INFORMADOS', INFORME: 'INFORME MÉDICO', REFERENCIA: 'INFORME DE ESTUDIOS',
    MATERIALES: 'MATERIALES', RECIPE: 'RÉCIPE E INDICACIONES', DAMERO: 'DAMERO DE LABORATORIOS', ELECTIVO: 'PACIENTES – CIRUGÍA GENERAL',
    ELECTIVO_URO: 'PACIENTES – UROLOGÍA', ELECTIVO_ORL: 'PACIENTES – ORL',
  };

  function rejillaSeguimiento(ids) {
    const rej = h('div.rejilla2');
    const mods = segPorIds(ids);
    mods.forEach((m, i) => {
      const f = info(m.id);
      rej.append(h('button.mosaico2' + (i === 0 && mods.length % 2 === 1 ? '.ancho' : ''), { type: 'button', onclick: () => elegirOrigen(m.id) },
        insigniaIcono(f.icono, 'cian'), h('div.textos', h('div.t1.ajustar', { 'data-grupo': 'seguimiento' }, TITULOS[m.id] || f.corto))));
    });
    return rej;
  }

  // ------------------------------------------------------------------ PACIENTES

  function pacientes() {
    const todas = Almacen.listar();
    const carpetas = Carpetas.agrupar(todas);
    pantalla.append(cabecera('PACIENTES', `${carpetas.length} PACIENTES · ${todas.length} DOCUMENTOS`));
    const c = cuerpo();
    const buscar = h('input.buscar-campo', { type: 'search', placeholder: 'NOMBRE O CÉDULA', 'aria-label': 'Buscar paciente' });
    buscar.value = filtroTexto;
    buscar.setAttribute('autocapitalize', 'characters');
    buscar.addEventListener('input', () => { filtroTexto = buscar.value; llenar(); });
    c.append(h('div.buscador', icono('buscar'), buscar));
    const chips = h('div.filtros');
    for (const [tipo, nombre] of [[null, 'TODOS'], ...modulos.map((m) => [m.id, info(m.id).corto])]) {
      chips.append(h('button.filtro' + (filtroTipo === tipo ? '.activo' : ''), { type: 'button', onclick: () => { filtroTipo = tipo; mostrar(1); } }, nombre));
    }
    c.append(chips);
    c.append(subtitulo('Carpetas', ['Recibir paciente', recibirPaciente]));
    const lista = h('div');
    c.append(lista);
    pantalla.append(c);
    function llenar() {
      lista.textContent = '';
      const f = mayus(filtroTexto.trim());
      const ds = digitos(f);
      const nf = Carpetas.claveNombre(f);
      const items = Carpetas.agrupar(Almacen.listar()).filter((cp) => (filtroTipo == null || (filtroTipo === 'ELECTIVOS' ? cp.tipos.some((t) => Carpetas.ELECTIVOS.includes(t)) : cp.tipos.includes(filtroTipo))) &&
        (!f || cp.docs.some((d) => Carpetas.claveNombre(d.nombre).includes(nf)) || (ds && cp.docs.some((d) => digitos(d.cedula).includes(ds)))));
      if (!items.length) { lista.append(vacio(carpetas.length ? 'NINGÚN PACIENTE COINCIDE CON LA BÚSQUEDA.' : 'AÚN NO HAY PACIENTES GUARDADOS.')); return; }
      for (const cp of items) lista.append(tarjetaCarpeta(cp));
    }
    llenar();
  }

  function tarjetaCarpeta(cp) {
    const partes = [];
    if (cp.cedula.trim()) partes.push('C.I. ' + cedulaBonita(cp.cedula));
    if (cp.edad.trim()) partes.push(`${cp.edad} AÑOS`);
    partes.push(`${cp.docs.length} ${cp.docs.length === 1 ? 'DOCUMENTO' : 'DOCUMENTOS'}`);
    const el = h('div.fila-tarjeta',
      h('button.fila-principal', { type: 'button', 'aria-label': 'Carpeta de ' + cp.nombre, onclick: () => { carpetaAbierta = cp.clave; mostrar(1); } },
        insignia(iniciales(cp.nombre), 'marino'),
        h('div.textos', h('div.t1', cp.nombre), h('div.t2', partes.join('  ·  ')),
          h('div.t3', cp.tipos.map((t) => info(t).corto).join(' · ') + '  ·  ' + mayus(Fecha.haceCuanto(cp.ultima))))),
      h('button.menu', { type: 'button', 'aria-label': 'Opciones', onclick: () => opcionesCarpeta(cp) }, icono('menu')));
    return el;
  }

  async function opcionesCarpeta(cp) {
    const w = await elegir(cp.nombre, ['Abrir carpeta', 'Nuevo documento', 'Enviar paciente a otro teléfono', 'Eliminar paciente']);
    if (w === 0) { carpetaAbierta = cp.clave; mostrar(1); }
    else if (w === 1) nuevoEnCarpeta(cp);
    else if (w === 2) enviarPaciente(cp);
    else if (w === 3 && await confirmar(`¿Eliminar los ${cp.docs.length} documentos de ${cp.nombre}? Esta acción no se puede deshacer.`, 'Eliminar')) {
      for (const r of cp.docs) await Almacen.borrar(r.id);
      carpetaAbierta = null; mostrar(actual);
    }
  }

  // ------------------------------------------------------------------ CARPETA DEL PACIENTE

  function carpeta(clave) {
    const cp = Carpetas.agrupar(Almacen.listar()).find((c) => c.clave === clave);
    const d = Almacen.cargar(cp.docs[0].id);
    const cab = cabecera(cp.nombre, 'CARPETA DEL PACIENTE');
    const partes = [];
    if (cp.cedula.trim()) partes.push('C.I. ' + cedulaBonita(cp.cedula));
    if (cp.edad.trim()) partes.push(`${cp.edad} AÑOS`);
    if ((d.NH || '').trim()) partes.push('NH ' + d.NH);
    if ((d.CAMA || '').trim()) partes.push(mayus(d.CAMA));
    if (partes.length) cab.append(h('div.cab-datos', partes.join('  ·  ')));
    cab.append(h('button.cab-volver', { type: 'button', onclick: () => { carpetaAbierta = null; mostrar(1); } }, '‹  TODOS LOS PACIENTES'));
    pantalla.append(cab);
    const c = cuerpo();
    c.append(h('div.acciones', boton('Nuevo documento', 'mas', 'cian', () => nuevoEnCarpeta(cp)), boton('Enviar', 'compartir', 'marino', () => enviarPaciente(cp))));
    let dia = '';
    for (const r of Carpetas.lineaDeTiempo(cp)) {
      const f = Fecha.diaLargo(new Date(Carpetas.fecha(r)));
      if (f !== dia) { dia = f; c.append(subtitulo(f)); }
      c.append(tarjetaDocumento(r));
    }
    pantalla.append(c);
  }

  function tarjetaDocumento(r) {
    return h('div.fila-tarjeta.doc',
      h('button.fila-principal', { type: 'button', onclick: () => abrirHistoria(r.id) },
        insigniaIcono(info(r.tipo).icono, 'cian-suave'),
        h('div.textos', h('div.t1', mayus(modulo(r.tipo).nombre)),
          h('div.t2', (r.fecha.trim() ? `FECHA ${r.fecha}  ·  ` : '') + 'EDITADO ' + mayus(Fecha.haceCuanto(r.modificado))))),
      h('button.menu', { type: 'button', 'aria-label': 'Opciones', onclick: () => opciones(r) }, icono('menu')));
  }

  async function opciones(r) {
    const w = await elegir(r.nombre, ['Abrir', 'Nuevo documento con estos datos', 'Duplicar', 'Eliminar', 'Ver carpeta del paciente']);
    if (w === 0) abrirHistoria(r.id);
    else if (w === 1) { const i = await elegir('Nuevo documento para ' + r.nombre, SEGUIMIENTO().map((m) => m.nombre)); if (i >= 0) crearDesde(r, SEGUIMIENTO()[i].id); }
    else if (w === 2) { await Almacen.duplicar(r.id); mostrar(actual); }
    else if (w === 3) { if (await confirmar(`¿Eliminar la historia de ${r.nombre}? Esta acción no se puede deshacer.`, 'Eliminar')) { await Almacen.borrar(r.id); mostrar(actual); } }
    else if (w === 4) { const cp = Carpetas.agrupar(Almacen.listar()).find((x) => x.docs.some((d) => d.id === r.id)); if (cp) { carpetaAbierta = cp.clave; mostrar(1); } }
  }

  function filaFormato(m, alTocar) {
    const f = info(m.id);
    return h('button.fila-formato', { type: 'button', onclick: alTocar }, insigniaIcono(f.icono, 'marino'),
      h('div.textos', h('div.t1', mayus(m.nombre)), h('div.t2', f.desc)), icono('siguiente', 'suave'));
  }

  function nuevoEnCarpeta(cp) {
    const { caja, cerrar } = hojaInferior('Nuevo documento', cp.nombre);
    const lista = h('div.hoja-lista');
    for (const [titulo, mods] of [...grupos().slice(1), grupos()[0]]) {
      lista.append(h('div.etiqueta-suave.margen', mayus(titulo)));
      for (const m of mods) lista.append(filaFormato(m, () => { cerrar(); crearEnCarpeta(cp, m.id); }));
    }
    caja.append(lista);
  }

  async function crearEnCarpeta(cp, tipo) {
    const origen = Carpetas.origenPara(tipo, cp.docs);
    if (!origen) return nuevaHistoria(tipo);
    // 6.1: la evolución lleva la NPT más reciente del paciente (hidratación ajustada + nutrición parenteral)
    const npt = cp.docs.filter((x) => x.tipo === 'NPT').sort((a, b) => b.modificado - a.modificado)[0];
    const extra = tipo === 'EVOLUCION' && npt && npt.id !== origen.id ? await Nucleo.ordenesNpt(Almacen.cargar(npt.id)) : {};
    crearDesde(origen, tipo, extra);
  }

  async function crearDesde(r, tipo, extra = {}) {
    const d = { ...Almacen.cargar(r.id), __ID__: r.id };
    const v = { ...(await Nucleo.traspaso(d, tipo, Preferencias.cirujano())), ...extra };
    const id = Almacen.nuevoId();
    await Almacen.guardar(id, v);
    abrirHistoria(id);
  }

  async function enviarPaciente(cp) {
    const ok = await confirmar(`Se enviará un archivo con los ${cp.docs.length} documentos de ${cp.nombre}.\n\nContiene datos del paciente: envíelo solo a ` +
      'colegas del servicio. En el otro teléfono o computadora, abra el archivo con la app (Pacientes › Recibir paciente).', 'Enviar', 'Enviar paciente');
    if (!ok) return;
    const listo = esperando('Preparando el archivo…');
    try {
      const r = await Copia.exportarPaciente(cp.docs.map((d) => d.id), cp.nombre, cp.cedula);
      listo();
      await compartirArchivo(r.blob, r.nombre);
    } catch (e) { listo(); aviso('No se pudo preparar el archivo: ' + e.message, true); }
  }

  async function recibirPaciente() {
    const [f] = await elegirArchivos('.zip,application/zip,application/x-zip-compressed,application/octet-stream');
    if (f) await importar(f);
  }

  /** Igual que ImportarActivity de Android: muestra qué trae el archivo y lo agrega. */
  async function importar(archivo) {
    const i = await Copia.info(archivo);
    if (!i) { aviso('Ese archivo no es de SurgyDocs', true); return; }
    const msg = i.paciente
      ? `Paciente: ${i.nombre || '(SIN NOMBRE)'}${i.cedula ? '\nC.I. ' + cedulaBonita(i.cedula) : ''}\n${i.historias} documento(s).\n\nSi un documento ya existe aquí, se conserva el más reciente.`
      : `Copia de seguridad con ${i.historias} historia(s), sus fotos, la agenda, los medicamentos y los nombres del equipo.\n\nSi una historia ya existe aquí, se conserva la más reciente.`;
    if (!await confirmar(msg, i.paciente ? 'Agregar paciente' : 'Restaurar', i.paciente ? 'Recibir paciente' : 'Restaurar copia')) return;
    const n = await Copia.restaurar(archivo);
    if (n < 0) { aviso('Ese archivo no es una copia de esta app', true); return; }
    aviso(i.paciente ? `Paciente agregado: ${n} documento(s) nuevos o actualizados` : `Copia restaurada: ${n} historias agregadas o actualizadas`, true);
    if (i.paciente) {
      const ced = digitos(i.cedula);
      const nom = Carpetas.claveNombre(i.nombre);
      carpetaAbierta = ced.length >= 5 ? 'CI:' + ced : (Carpetas.agrupar(Almacen.listar()).find((c) => Carpetas.claveNombre(c.nombre) === nom) || {}).clave || null;
      mostrar(1);
    } else mostrar(actual);
  }

  // ------------------------------------------------------------------ AGENDA

  function agenda() {
    pantalla.append(cabecera('AGENDA', 'GUARDIAS, CONSULTAS, ACTIVIDADES Y CIRUGÍAS'));
    const c = cuerpo();
    const porDia = new Map();
    for (const e of Agenda.todos()) { if (!porDia.has(e.fecha)) porDia.set(e.fecha, []); porDia.get(e.fecha).push(e); }
    const mover = (d) => { mesAgenda = new Date(mesAgenda.getFullYear(), mesAgenda.getMonth() + d, 1); mostrar(2); };
    c.append(h('div.mes-nav', h('button.flecha-mes', { type: 'button', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, '‹'),
      h('div.mes', Fecha.mesAnio(mesAgenda)), h('button.flecha-mes', { type: 'button', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, '›')));
    const rej = h('div.calendario');
    for (const d of ['L', 'M', 'M', 'J', 'V', 'S', 'D']) rej.append(h('div.cal-dia-sem', d));
    const vacios = (mesAgenda.getDay() + 6) % 7;
    for (let i = 0; i < vacios; i++) rej.append(h('div'));
    const hoy = Fecha.hoy();
    const dias = new Date(mesAgenda.getFullYear(), mesAgenda.getMonth() + 1, 0).getDate();
    for (let n = 1; n <= dias; n++) {
      const f = Fecha.iso(new Date(mesAgenda.getFullYear(), mesAgenda.getMonth(), n));
      const evs = porDia.get(f) || [];
      const puntos = h('div.puntos');
      for (const t of [...new Set(evs.map((e) => e.tipo))].slice(0, 4)) puntos.append(h('span.punto', { style: { background: Agenda.color(t) } }));
      rej.append(h('button.cal-dia' + (f === diaAgenda ? '.elegido' : f === hoy ? '.hoy' : '') + (evs.length ? '.con' : ''),
        { type: 'button', 'aria-label': 'Día ' + n, onclick: () => { diaAgenda = f; mostrar(2); } }, h('span', String(n)), puntos));
    }
    c.append(h('div.tarjeta.cal', rej));
    c.append(subtitulo(Fecha.largo(diaAgenda), ['Agregar', nuevoEvento]));
    const delDia = porDia.get(diaAgenda) || [];
    if (!delDia.length) c.append(vacio('SIN ACTIVIDADES. TOQUE AGREGAR PARA ANOTAR UNA GUARDIA, CONSULTA, SEMINARIO O PRESENTACIÓN.'));
    for (const e of delDia) c.append(filaEvento(e, false));
    const prox = Agenda.proximos(14).filter((e) => e.fecha !== diaAgenda);
    if (prox.length) {
      c.append(subtitulo('Próximos 14 días'));
      let dia = '';
      for (const e of prox) {
        if (e.fecha !== dia) { dia = e.fecha; c.append(h('div.etiqueta-suave.margen', Fecha.largo(e.fecha))); }
        c.append(filaEvento(e, false));
      }
    }

    // Avisos: en el iPhone los da el Calendario del teléfono; en Windows, la app al abrirse.
    c.append(subtitulo('Avisos'));
    const t = tarjeta();
    const activo = Almacen.pref('ajustes', 'rec_activo', 'SÍ') !== 'NO';
    const sw = h('input.interruptor', { type: 'checkbox' }); sw.checked = activo;
    const sw2 = h('input.interruptor', { type: 'checkbox' }); sw2.checked = Almacen.pref('ajustes', 'rec_mismo_dia', 'NO') === 'SÍ';
    const hora = h('input.campo.hora', { type: 'time' }); hora.value = Almacen.pref('ajustes', 'rec_hora', '19:00');
    const aplicar = () => Almacen.ponerPref('ajustes', { rec_activo: sw.checked ? 'SÍ' : 'NO', rec_hora: hora.value || '19:00', rec_mismo_dia: sw2.checked ? 'SÍ' : 'NO' });
    sw.addEventListener('change', aplicar); sw2.addEventListener('change', aplicar); hora.addEventListener('change', aplicar);
    t.append(h('label.fila-si-no', h('span', 'Avisarme el día anterior'), sw),
      h('label.fila-hora', h('span', 'HORA DEL AVISO'), hora),
      h('label.fila-si-no', h('span', 'También el mismo día a las 6:00 AM'), sw2),
      h('p.nota', esWindows
        ? 'Ejemplo: "Mañana tienes guardia. ¡Prepárate!". En la computadora el aviso aparece al abrir la app. Para recibirlo en el teléfono, use "Agregar al calendario" y abra el archivo allí.'
        : 'Ejemplo: "Mañana tienes guardia. ¡Prepárate!". En el iPhone los avisos los da el Calendario: toque "Agregar al calendario" cada vez que anote actividades nuevas.'),
      boton('Agregar al calendario (.ics)', 'agenda', 'cian ancho', exportarCalendario),
      h('p.nota', 'Las cirugías salen de la fecha probable de cirugía de cada paciente electivo.'));
    c.append(t);
    pantalla.append(c);
  }

  async function exportarCalendario() {
    const evs = Agenda.todos().filter((e) => e.fecha >= Fecha.hoy());
    if (!evs.length) { aviso('No hay actividades próximas en la agenda'); return; }
    const blob = new Blob([Agenda.ics(evs)], { type: 'text/calendar' });
    const nombre = `Agenda_${Fecha.hoy()}.ics`;
    if (esWindows || !esIOS) { descargar(blob, nombre); aviso(`${evs.length} actividades: abra el archivo .ics para agregarlas al calendario`, true); return; }
    // iPhone: Safari muestra el archivo .ics y ofrece "Agregar todo" al Calendario
    const w = await elegir(`${evs.length} actividades`, ['Abrir en Calendario', 'Guardar el archivo (abrirlo luego desde Archivos)']);
    if (w === 0) {
      const ics = Agenda.ics(evs);
      const url = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
      const v = window.open(url, '_blank');
      if (!v) location.href = url;
    } else if (w === 1) await compartirArchivo(blob, nombre);
  }

  function filaEvento(e, compacta) {
    return h('button.evento' + (compacta ? '.compacta' : ''), { type: 'button', onclick: async () => {
      if (e.tipo === Agenda.CIRUGIA) {
        // 8.2: abrir la ficha del paciente electivo o eliminarlo (y con él, la cirugía de la agenda)
        const w = await elegir(Agenda.texto(e), ['Abrir ficha del paciente electivo', 'Eliminar paciente electivo']);
        if (w === 0) abrirHistoria(e.historia);
        else if (w === 1 && await confirmar(`¿Eliminar la ficha de ${e.titulo.split(' – ')[0]}? Su cirugía también sale de la agenda. Esta acción no se puede deshacer.`, 'Eliminar')) {
          await Almacen.borrar(e.historia); mostrar(actual);
        }
        return;
      }
      const ops = e.serie ? ['Eliminar este día', 'Eliminar toda la serie'] : ['Eliminar'];
      const w = await elegir(Agenda.texto(e), ops);
      if (w >= 0) { await Agenda.borrar(e, w === 1); mostrar(actual); }
    } },
    h('span.barra-color', { style: { background: Agenda.color(e.tipo) } }),
    h('div.textos',
      e.titulo.trim() && e.titulo !== e.tipo ? h('div.ev-tipo', { style: { color: Agenda.color(e.tipo) } }, e.tipo === Agenda.CIRUGIA ? 'CIRUGÍA' : e.tipo) : null,
      h('div.t1', (!e.titulo.trim() || e.titulo === e.tipo ? e.tipo : e.titulo) + (!compacta && e.tipo === Agenda.CIRUGIA ? `  ·  ${Fecha.dmaIso(e.fecha)}` : ''))),
    e.hora ? h('div.ev-hora', Fecha.horaBonita(e.hora)) : null);
  }

  function nuevoEvento() {
    const { caja, cerrar } = hojaInferior('Nuevo en la agenda');
    const form = h('div.hoja-lista');
    let tipo = 'GUARDIA', repetir = Agenda.REPETIR[0];
    const chipsSel = (ops, val, cols, al) => {
      const cont = h('div.chips', { style: { gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` } });
      const bs = ops.map((o) => h('button.chip' + (o === val ? '.activo' : ''), { type: 'button', onclick: () => { bs.forEach((b) => b.classList.remove('activo')); bs[ops.indexOf(o)].classList.add('activo'); al(o); } }, o));
      cont.append(...bs);
      return cont;
    };
    const titulo = h('input.campo', { type: 'text', placeholder: 'EJ: SEMINARIO DE PANCREATITIS' });
    titulo.setAttribute('autocapitalize', 'characters');
    const fecha = h('input.campo', { type: 'date' }); fecha.value = diaAgenda;
    const hora = h('input.campo', { type: 'time' });
    const cada = h('input.campo', { type: 'number', min: '1', max: '60', placeholder: 'CADA CUÁNTOS DÍAS (EJ: 4 PARA GUARDIAS CADA 4 DÍAS)' }); cada.hidden = true;
    const hasta = h('input.campo', { type: 'date' });
    const filaHasta = h('div', h('div.etiqueta', 'HASTA (VACÍO = 3 MESES)'), hasta); filaHasta.hidden = true;
    form.append(h('div.etiqueta', 'TIPO'), chipsSel(Agenda.TIPOS, tipo, 3, (o) => { tipo = o; }),
      h('div.etiqueta', 'DETALLE (OPCIONAL)'), titulo,
      h('div.etiqueta', 'FECHA'), fecha, h('div.etiqueta', 'HORA (OPCIONAL)'), hora,
      h('div.etiqueta', 'REPETIR'), chipsSel(Agenda.REPETIR, repetir, 3, (o) => { repetir = o; cada.hidden = o !== 'CADA N DÍAS'; filaHasta.hidden = o === Agenda.REPETIR[0]; }),
      cada, filaHasta,
      boton('Guardar', 'guardar', 'cian ancho', async () => {
        if (!fecha.value) { aviso('Elija la fecha'); return; }
        const n = await Agenda.agregar(tipo || 'ACTIVIDAD', titulo.value, fecha.value, hora.value || '', repetir, parseInt(cada.value, 10) || 7, hasta.value || '');
        cerrar();
        diaAgenda = fecha.value;
        const d = Fecha.desdeIso(fecha.value); if (d) mesAgenda = new Date(d.getFullYear(), d.getMonth(), 1);
        aviso(n === 1 ? 'Guardado en la agenda' : `Guardado: ${n} días`);
        mostrar(2);
      }));
    caja.append(form);
  }

  // ------------------------------------------------------------------ FORMATOS

  function formatos() {
    pantalla.append(cabecera('FORMATOS', 'EMERGENCIA, HOSPITALIZACIÓN Y DOCUMENTOS'));
    const c = cuerpo();
    for (const [titulo, mods] of grupos()) {
      c.append(subtitulo(titulo));
      for (const m of mods) {
        const f = info(m.id);
        c.append(tarjeta(h('div.fila', insigniaIcono(f.icono, 'marino'), h('div.textos', h('div.t1', mayus(m.nombre)), h('div.t2', f.desc))),
          h('div.hojas', f.hojas),
          boton(m.seguimiento ? 'Nuevo' : 'Nueva historia', 'mas', 'marino ancho', () => (m.seguimiento ? elegirOrigen(m.id) : nuevaHistoria(m.id)))));
      }
    }
    pantalla.append(c);
  }

  // ------------------------------------------------------------------ AJUSTES

  async function guardarCopia() {
    const listo = esperando('Preparando la copia…');
    try {
      const r = await Copia.exportar();
      listo();
      if (esWindows) descargar(r.blob, r.nombre); else await compartirArchivo(r.blob, r.nombre);
      aviso(`Copia lista: ${r.n} historias`, true);
      if (actual === 0 || actual === 4) mostrar(actual);
    } catch (e) { listo(); aviso('No se pudo guardar la copia: ' + e.message, true); }
  }

  async function restaurarCopia() {
    const [f] = await elegirArchivos('.zip,application/zip,application/x-zip-compressed,application/octet-stream');
    if (f) await importar(f);
  }

  function ajustes() {
    pantalla.append(cabecera('AJUSTES', `VERSIÓN ${VERSION} · ${esWindows ? 'WINDOWS' : 'IPHONE / WEB'}`));
    const c = cuerpo();
    c.append(subtitulo('Perfil del médico'));
    const nombre = h('input.campo', { type: 'text', placeholder: 'EJ: DRA. PÉREZ' }); nombre.value = Preferencias.medico();
    const cir = h('input.campo', { type: 'text', placeholder: 'EJ: DRA. RODRÍGUEZ' }); cir.value = Preferencias.cirujano();
    for (const x of [nombre, cir]) { x.setAttribute('autocapitalize', 'characters'); x.addEventListener('input', () => { x.value = x.value.toLocaleUpperCase('es'); }); }
    let grado = Preferencias.grado();
    const filaGrado = h('div.grados');
    const pintar = () => filaGrado.querySelectorAll('button').forEach((b) => b.classList.toggle('activo', b.dataset.g === grado));
    for (const g of Preferencias.GRADOS) {
      const b = h('button.filtro', { type: 'button', onclick: () => { grado = grado === g ? '' : g; pintar(); } }, g === 'ESPECIALISTA' ? 'ESP.' : g);
      b.dataset.g = g;
      filaGrado.append(b);
    }
    pintar();
    c.append(tarjeta(h('div.etiqueta', 'SU NOMBRE (COMO FIRMA LAS NOTAS)'), nombre, h('div.etiqueta', 'GRADO'), filaGrado,
      h('div.etiqueta', 'CIRUJANO DE GUARDIA / ADJUNTO POR DEFECTO'), cir,
      h('p.nota', 'Su nombre y grado se escriben solos en "Realizado por" (notas de procedimiento) y "Médico remitente" (biopsias). ' +
        'El cirujano va en "Se comenta caso con", la cita del egreso y el adjunto de las interconsultas. Puede cambiarlos en cada documento.'),
      boton('Guardar', 'guardar', 'cian ancho', async () => {
        await Almacen.ponerPref('ajustes', { medico: mayus(nombre.value.trim()), grado, cirujano: mayus(cir.value.trim()) });
        const f = Preferencias.firma();
        aviso('Perfil guardado' + (f ? ': ' + f : ''));
      })));

    if (Nube.disponible()) {
      c.append(subtitulo('Cuenta de Google'));
      const sync = Nube.ultimaSync();
      if (!Nube.cuenta()) c.append(tarjeta(h('p.texto', 'Sin cuenta: sus pacientes están solo en este equipo.\n\nConecte su cuenta de Google Drive para guardarlos en una carpeta privada de su Drive y verlos en cualquier equipo donde entre con la misma cuenta.'),
        boton('Conectar con Google Drive', 'descargar', 'cian ancho', mostrarLogin)));
      else c.append(tarjeta(h('p.texto', (Nube.cuenta() || 'Sin sesión') +
        '\n\nSus pacientes se sincronizan con su Google Drive (carpeta privada de la app) y aparecen en cualquier equipo donde entre con esta cuenta. ' +
        'Se sincroniza al abrir, al guardar un documento y al cerrar la app.\n\nÚltima sincronización: ' + (sync > 0 ? Fecha.conHora(sync) : 'nunca')),
        boton('Sincronizar ahora', 'descargar', 'cian ancho', () => sincronizarFondo(true)),
        boton('Cerrar sesión', 'cerrar', 'marino ancho', async () => {
          if (!await confirmar('Se sincronizará por última vez. Los pacientes quedan en este equipo y la app sigue funcionando de forma normal, sin cuenta. Puede volver a conectarla cuando quiera.', 'Cerrar sesión', 'Cerrar sesión')) return;
          const listo = esperando('Sincronizando…');
          await Nube.sincronizar();
          await Nube.cerrarSesion();
          listo();
          mostrar(actual);
        })));
    }

    c.append(subtitulo('Copia de seguridad'));
    const ult = Copia.ultima();
    c.append(tarjeta(h('p.texto', (esWindows
      ? 'Guarda todas las historias, sus fotos, la agenda, los medicamentos y los nombres del equipo en un archivo .zip. Guárdelo en una memoria USB, OneDrive o Google Drive.'
      : 'Guarda todas las historias, sus fotos, la agenda, los medicamentos y los nombres del equipo en un archivo .zip. En la ventana que se abre, elija "Guardar en Archivos" (iCloud Drive) o Google Drive.') +
      ' El mismo archivo sirve para pasar todo a Android, iPhone o Windows con "Restaurar copia".\n\nÚltima copia: ' + (ult > 0 ? Fecha.conHora(ult) : 'nunca')),
      boton('Guardar copia', 'guardar', 'cian ancho', guardarCopia),
      boton('Restaurar copia', 'descargar', 'marino ancho', restaurarCopia)));

    c.append(subtitulo('Novedades de la versión'));
    c.append(tarjeta(...[
      '8.5.0: menú de MEDICAMENTOS por categorías (antibióticos, analgésicos, antieméticos, protectores gástricos, corticoides, hemostáticos, insulina…) con "+ Agregar medicamento" propio; servicio al que ingresa el paciente (cirugía general, urología, otorrinolaringología) con su examen físico (genitales; oídos, nariz y boca); infecciones con diagnósticos de piel y partes blandas y absceso escrotal; versión SurgyDocs C para el Hospital Universitario Dr. Alfredo Van Grieken.',
      '8.4.0: respuesta de interconsulta y nota de cirugía general con MASTITIS y descripción guiada de mama y cuello (siempre por encima del tórax); nuevos formatos de emergencia INFECCIONES y COLOPROCTOLOGÍA; pacientes electivos de UROLOGÍA y OTORRINOLARINGOLOGÍA (sin fotos ni presentación); listas de materiales de urología, otorrinolaringología, traqueostomía y limpieza quirúrgica; DAMERO de laboratorios; egreso por servicio; nota operatoria de traqueostomía; fechas con 6 dígitos (021026 escribe 02/10/2026); glicemia capilar con diabetes compensada o descompensada; doble antibiótico en las órdenes; preparar para quirófano opcional; lado en ojos, oídos y extremidades del politraumatizado; maniobras apendiculares con botones.',
      '8.3.0: cuenta de Google opcional ("Continuar" usa la app como siempre; "Continuar con Google Drive" guarda sus pacientes en su Drive y los muestra en cualquier equipo con la misma cuenta). Los archivos Word se llaman "HC JUAN PÉREZ APENDICITIS AGUDA", "LISTA DE MATERIALES JUAN PÉREZ APENDICECTOMÍA ABIERTA", "INFORME MÉDICO JUAN PÉREZ LABORATORIOS"…',
      '8.2.0: lista de materiales con letra 12 y renglones que llenan la hoja; curvas con título subrayado, datos en un renglón (nombre, edad, C.I., NH) y cuadrícula continua más grande; informe médico con la misma letra en todo, espacios parejos y raya para el sello; los pacientes electivos se pueden eliminar desde su ficha y desde la agenda (su cirugía sale del calendario).',
      '8.1.0: la app se llama SurgyDocs. Vista previa igual a la hoja impresa. NH en blanco deja el espacio para escribirlo. Mannheim visible en la nota operatoria, plan "PROBABLE ALTA MÉDICA" / "ALTA MÉDICA EL DÍA DE HOY", exámenes por regiones en párrafos separados, Materiales envía por WhatsApp la lista y el informe en Word, resumen de caso clínico del electivo en una hoja y dibujo de portada según la patología.',
      '8.0.1: barra de abajo en mayúsculas (INICIO, PACIENTES, AGENDA, FORMATOS, AJUSTES) y encabezado "CIRUGÍA GENERAL".',
      'Versión final (8.0): todas las correcciones de la revisión por módulos (nota operatoria, evolución y órdenes, procedimientos, curvas, egreso, interconsultas, solicitudes, consentimiento, informes, materiales, récipe, electivos y presentación). Enter pasa al campo siguiente en todos los formatos.',
      '7.1: la app ahora se llama SurgyDoc, con ícono nuevo (hoja con bisturí) y pantalla de bienvenida. En el Inicio los formatos muestran solo su nombre y ninguna palabra se corta.',
      'Nueva: versión para iPhone (app web que se instala desde Safari y funciona sin internet) y para Windows (programa instalable).',
      'Son los mismos formatos de Android: los Word y la presentación salen idénticos porque usan el mismo motor.',
      'Copia de seguridad y "Enviar paciente" con el mismo archivo .zip: un paciente pasa de Android a iPhone o a Windows y al revés.',
      'Agenda: en el iPhone los avisos se agregan al Calendario del teléfono con "Agregar al calendario".',
      'Los datos de los pacientes quedan solo en este equipo; internet solo se usa para instalar y actualizar la app.',
    ].map((l) => h('p.novedad', '•  ' + l))));

    c.append(subtitulo('Acerca de'));
    c.append(tarjeta(h('p.texto', `${INSTITUCION.nombreApp} · CIRUGÍA GENERAL\nDiseñada por Dr. Edgardo Caripas\n${INSTITUCION.hospitalTitulo}\nVersión ${VERSION}\n\n` +
      (esWindows ? 'Las historias se guardan solo en esta computadora' : 'Las historias se guardan solo en este teléfono') +
      '; para pasar un paciente a otro equipo use Enviar en su carpeta.')));
    pantalla.append(c);
  }

  // ------------------------------------------------------------------ hojas inferiores

  function elegirOrigen(tipo) {
    const m = modulo(tipo);
    const { caja, cerrar } = hojaInferior(m.nombre);
    caja.append(boton('Datos nuevos', 'mas', 'marino ancho', () => { cerrar(); nuevaHistoria(tipo); }));
    const carpetas = Carpetas.agrupar(Almacen.listar());
    if (carpetas.length) {
      caja.append(h('div.etiqueta-suave.margen', 'O CON LOS DATOS DE UN PACIENTE GUARDADO'));
      const lista = h('div.hoja-lista.corta');
      for (const cp of carpetas.slice(0, 40)) {
        lista.append(h('button.fila-formato', { type: 'button', onclick: () => { cerrar(); crearEnCarpeta(cp, tipo); } },
          insignia(iniciales(cp.nombre), 'marino chica'),
          h('div.textos', h('div.t1', cp.nombre), h('div.t2', cp.tipos.slice(0, 4).map((t) => info(t).corto).join(' · ') + '  ·  ' + mayus(Fecha.haceCuanto(cp.ultima))))));
      }
      caja.append(lista);
    }
  }

  function elegirFormato() {
    const { caja, cerrar } = hojaInferior('Nuevo', 'Elija el formato');
    const lista = h('div.hoja-lista');
    for (const [titulo, mods] of grupos()) {
      lista.append(h('div.etiqueta-suave.margen', mayus(titulo)));
      for (const m of mods) lista.append(filaFormato(m, () => { cerrar(); if (m.seguimiento) elegirOrigen(m.id); else nuevaHistoria(m.id); }));
    }
    caja.append(lista);
  }

  function accionFab() {
    if (actual === 1 && carpetaAbierta) { const cp = Carpetas.agrupar(Almacen.listar()).find((x) => x.clave === carpetaAbierta); if (cp) { nuevoEnCarpeta(cp); return; } }
    if (actual === 2) { nuevoEvento(); return; }
    elegirFormato();
  }

  // ------------------------------------------------------------------ aviso de la agenda al abrir (Windows y web)

  function avisoAgenda() {
    if (Almacen.pref('ajustes', 'rec_activo', 'SÍ') === 'NO') return;
    const ahora = new Date();
    const [hh, mm] = (Almacen.pref('ajustes', 'rec_hora', '19:00') || '19:00').split(':').map((x) => parseInt(x, 10) || 0);
    const mostrarAviso = (fecha, cuando, clave) => {
      if (Almacen.pref('copia', clave) === fecha) return;
      const a = Agenda.aviso(Agenda.delDia(fecha), cuando);
      if (!a) return;
      Almacen.ponerPref('copia', { [clave]: fecha });
      aviso(a.titulo, true);
      if (enAppWindows) { window.chrome.webview.postMessage({ tipo: 'aviso', titulo: a.titulo, texto: a.lineas.join(' · ') }); return; }
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification(a.titulo, { body: a.lineas.join(' · '), icon: 'iconos/icono-192.png' }); } catch (_) {}
    };
    if (ahora.getHours() * 60 + ahora.getMinutes() >= hh * 60 + mm) mostrarAviso(Fecha.manana(), 'Mañana', 'aviso_manana');
    else mostrarAviso(Fecha.hoy(), 'Hoy', 'aviso_hoy');
  }

  // ------------------------------------------------------------------ arranque

  async function iniciar() {
    const inicioCarga = performance.now();
    await Almacen.iniciar();
    modulos = await Nucleo.modulos();
    contenedor = h('main.contenedor');
    pantalla = h('div.pantalla');
    contenedor.append(pantalla);
    fab = h('button.fab', { type: 'button', onclick: accionFab }, icono('mas'), h('span', 'Nuevo'));
    barra = h('nav.barra-inferior');
    [['INICIO', 'inicio'], ['PACIENTES', 'pacientes'], ['AGENDA', 'agenda'], ['FORMATOS', 'formatos'], ['AJUSTES', 'ajustes']].forEach(([t, ic], i) => {
      barra.append(h('button.nav-item', { type: 'button', onclick: () => { if (i === 1) carpetaAbierta = null; mostrar(i); } }, h('span.nav-ico', icono(ic)), h('span.nav-t.ajustar', { 'data-grupo': 'barra' }, t)));
    });
    requestAnimationFrame(() => ajustarTextos(barra));
    capaEditor = h('div.capa-editor', { hidden: true });
    document.body.append(contenedor, fab, barra, capaEditor);
    mostrar(0);
    // 7.1: la bienvenida queda al menos 2,4 s (o hasta que la toquen) y se desvanece
    const arranque = document.getElementById('arranque');
    if (arranque) {
      const quitar = () => { arranque.classList.add('fuera'); setTimeout(() => arranque.remove(), 400); };
      arranque.addEventListener('click', quitar);
      setTimeout(quitar, Math.max(0, 2400 - (performance.now() - inicioCarga)));
    }
    window.addEventListener('resize', () => ajustarTextos(document.body));
    avisoAgenda();
    // 8.3: cuenta de Google (solo en la app de Windows): obligatoria la primera vez; después queda guardada
    if (Nube.disponible()) {
      document.addEventListener('nube-token', () => sincronizarFondo());
      Nube.avisarPrograma(!!Nube.cuenta());
      if (!Nube.cuenta() && !Nube.omitido()) mostrarLogin(); else sincronizarFondo();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { if (Editor.abierto()) Editor.guardar(); sincronizarPronto(); } });
    }
    // Windows: archivo .zip abierto con la app (doble clic en "Paciente_….zip")
    if (window.chrome?.webview) {
      window.chrome.webview.addEventListener('message', async (e) => {
        const m = e.data || {};
        // Al cerrar la ventana con sesión iniciada: se guarda lo que se estaba escribiendo y se sincroniza por última vez
        if (m.tipo === 'cerrar') {
          try {
            if (Editor.abierto()) Editor.guardar();
            // Si ya hay una sincronización en curso se espera a que termine (máx. 10 s) y se repite, para que suba la última edición
            for (let i = 0; i < 20 && Nube.ocupado(); i++) await new Promise((ok) => setTimeout(ok, 500));
            await Nube.sincronizar();
          } catch (_) {}
          window.chrome.webview.postMessage({ tipo: 'cerrar_ok' });
        }
        if (m.tipo === 'importar' && m.datos) importar(new Blob([deBase64(m.datos)], { type: 'application/zip' }));
        if (m.tipo === 'atras') { if (Editor.abierto()) Editor.cerrar(); else if (actual === 1 && carpetaAbierta) { carpetaAbierta = null; mostrar(1); } else if (actual !== 0) mostrar(0); }
      });
      window.chrome.webview.postMessage({ tipo: 'listo' });
    }
    // iPhone / navegador: archivo compartido con la app instalada (si el sistema lo permite)
    if ('launchQueue' in window) window.launchQueue.setConsumer(async (p) => { for (const a of p.files || []) importar(await a.getFile()); });
  }

  return { iniciar, modulo, mostrarEditor, cerrarEditor, mostrar };
})();
