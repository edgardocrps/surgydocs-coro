// 7.0: lógica de las pantallas (igual que Android): fechas, perfil, carpetas del paciente y agenda.

const VERSION = '8.5.2';

// ------------------------------------------------------------------ fechas
const Fecha = (() => {
  const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  const DIAS_C = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const MESES_C = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEPT', 'OCT', 'NOV', 'DIC'];
  const d2 = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}`;
  function desdeIso(t) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t || '');
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }
  /** "15/10/2026" o "15/10/26" (estricto, como SimpleDateFormat sin indulgencia). */
  function desdeDma(t) {
    const s = (t || '').trim();
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
    if (!m) return null;
    if (m[3].length === 4 && s.length !== 10) return null;
    let a = +m[3];
    if (m[3].length === 2) { a += 2000; if (a > new Date().getFullYear() + 20) a -= 100; }
    const d = new Date(a, +m[2] - 1, +m[1]);
    if (d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[1]) return null;
    return d;
  }
  const dma = (d) => `${d2(d.getDate())}/${d2(d.getMonth() + 1)}/${d.getFullYear()}`;
  const dmaCorto = (d) => `${d2(d.getDate())}/${d2(d.getMonth() + 1)}/${d2(d.getFullYear() % 100)}`;
  const hoy = () => iso(new Date());
  const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); return iso(d); };
  function horaBonita(h) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(h || '');
    if (!m) return h || '';
    const hh = +m[1];
    return `${hh % 12 === 0 ? 12 : hh % 12}:${m[2]} ${hh < 12 ? 'AM' : 'PM'}`;
  }
  const largo = (t) => { const d = desdeIso(t); return d ? `${DIAS[d.getDay()]} ${d.getDate()} DE ${MESES[d.getMonth()]}` : t; };
  const dmaIso = (t) => { const d = desdeIso(t); return d ? dma(d) : t; };
  const mesAnio = (d) => `${MESES[d.getMonth()]} ${d.getFullYear()}`;
  const corto = (d) => `${DIAS_C[d.getDay()]} ${d.getDate()} ${MESES_C[d.getMonth()]}`;
  const diaLargo = (d) => `${DIAS[d.getDay()]} ${dma(d)}`;
  function haceCuanto(ms) {
    const min = Math.floor((Date.now() - ms) / 60000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return `hace ${min} min`;
    if (min < 24 * 60) return `hace ${Math.floor(min / 60)} h`;
    if (min < 48 * 60) return 'ayer';
    return dmaCorto(new Date(ms));
  }
  function conHora(ms) {
    const d = new Date(ms);
    return `${dma(d)} ${horaBonita(`${d.getHours()}:${d2(d.getMinutes())}`)}`;
  }
  return { iso, desdeIso, desdeDma, dma, dmaCorto, hoy, manana, horaBonita, largo, dmaIso, mesAnio, corto, diaLargo, haceCuanto, conHora, d2 };
})();

// ------------------------------------------------------------------ textos

function mayus(t) { return (t || '').toLocaleUpperCase('es'); }
function sinTildes(t) { return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function digitos(t) { return (t || '').replace(/\D/g, ''); }
/** Cédula con puntos de miles: 25402941 -> 25.402.941; conserva V-/E-. */
function cedulaBonita(bruta) {
  const t = mayus((bruta || '').trim());
  const m = /^([A-Z]\s*-?\s*)?([0-9.\s]+)$/.exec(t);
  if (!m) return t;
  const ds = digitos(m[2]);
  if (!ds) return t;
  const con = ds.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const pref = (m[1] || '').replace(/[^A-Z]/g, '');
  return pref ? `${pref}-${con}` : con;
}
function iniciales(n) {
  const p = (n || '').split(/\s+/).filter((x) => x && /\p{L}/u.test(x[0]));
  if (!p.length) return '?';
  if (p.length === 1) return mayus(p[0].slice(0, 2));
  return mayus(p[0][0] + p[Math.floor(p.length / 2)][0]);
}
function nombreArchivo(t) { return (t || '').trim().replace(/[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]+/g, '_'); }

/**
 * 8.3: nombre de los archivos Word: "TIPO PACIENTE DETALLE.docx", solo espacios (ej. "HC JUAN PÉREZ APENDICITIS AGUDA.docx").
 * Mismas reglas que NombreArchivo.kt de Android: mantenerlas iguales.
 */
const NombreArchivo = (() => {
  const ETIQUETAS = {
    APENDICITIS: 'HC', BILIAR: 'HC', POLITRAUMA: 'HC', OBSTRUCCION: 'HC', VASCULAR: 'HC', PARED: 'HC', INFECCIONES: 'HC', COLOPROCT: 'HC',
    NOTA: 'NOTA OPERATORIA', EVOLUCION: 'EVOLUCIÓN Y ÓRDENES', EGRESO: 'EGRESO', RECIPE: 'RÉCIPE',
    RESP_IC: 'RESPUESTA IC', NOTA_CG: 'NOTA CG', MATERIALES: 'LISTA DE MATERIALES', INFORME: 'INFORME MÉDICO',
    REFERENCIA: 'INFORME DE ESTUDIO', SOLICITUDES: 'SOLICITUDES', CONSENTIMIENTO: 'CONSENTIMIENTO',
    PROCEDIMIENTO: 'PROCEDIMIENTO', CURVAS: 'CURVAS', DAMERO: 'DAMERO', NPT: 'NUTRICIÓN PARENTERAL', ELECTIVO: 'HC ELECTIVO', ELECTIVO_URO: 'HC ELECTIVO UROLOGÍA', ELECTIVO_ORL: 'HC ELECTIVO ORL',
  };
  // Solo letras (con tildes y Ñ), números y espacios: ningún guion ni símbolo
  const limpio = (t) => (t || '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLocaleUpperCase('es');
  const primero = (t) => (t || '').split(/[\n|;]/).map((s) => s.trim()).find((s) => s) || '';
  const corto = (t) => { const p = primero(t); return limpio(p.includes(':') ? p.slice(p.lastIndexOf(':') + 1) : p); };

  function detalle(tipo, d, nombreModulo) {
    const dx = () => corto(d('DX_CORTO')) || corto(d('DX_PRINCIPAL')) || corto(d('DX_SEL')) || corto(d('DX_L'));
    let r;
    switch (tipo) {
      case 'APENDICITIS': case 'BILIAR': case 'POLITRAUMA': case 'OBSTRUCCION': case 'VASCULAR': case 'PARED': case 'INFECCIONES': case 'COLOPROCT': r = dx() || limpio(nombreModulo); break;
      case 'NOTA': r = corto(d('INTERV_REALIZADA')) || corto(d('INTERV_INDICADA')); break;
      case 'PROCEDIMIENTO': r = corto(d('proc')); break;
      case 'MATERIALES': r = corto(d('mat_cirugia')); break;
      case 'INFORME': {
        const m = (d('inf_motivo') || '').trim();
        r = m === 'ESTUDIO DE IMAGEN' ? (corto(d('inf_estudio')) || 'ESTUDIO DE IMAGEN')
          : m === 'MATERIAL MÉDICO QUIRÚRGICO' ? (corto(d('inf_cirugia')) || 'MATERIAL MÉDICO QUIRÚRGICO') : corto(m);
        break;
      }
      case 'REFERENCIA': r = (d('ref_estudio') === 'TOMOGRAFÍA' && corto(d('ref_tac'))) || corto(d('ref_estudio')); break;
      case 'SOLICITUDES': case 'CONSENTIMIENTO': case 'EGRESO': case 'ELECTIVO': case 'ELECTIVO_URO': case 'ELECTIVO_ORL': r = corto(d('INTERVENCION')) || dx(); break;
      case 'CURVAS': case 'NPT': case 'RECIPE': case 'DAMERO': r = ''; break;
      default: r = dx();
    }
    return (r || '').slice(0, 70).trim();
  }

  /** d: función clave -> valor del campo. etiqueta: reemplaza al tipo (p. ej. la presentación del electivo). */
  function armar(tipo, paciente, d, nombreModulo, extension = 'docx', etiqueta = null) {
    const partes = [limpio(etiqueta || ETIQUETAS[tipo] || nombreModulo), limpio(paciente).slice(0, 60).trim() || 'SIN NOMBRE', detalle(tipo, d, nombreModulo)];
    return partes.filter(Boolean).join(' ') + '.' + extension;
  }
  return { armar, limpio };
})();

// ------------------------------------------------------------------ perfil del médico (Ajustes)
const Preferencias = {
  GRADOS: ['R1', 'R2', 'R3', 'R4', 'ESPECIALISTA'],
  cirujano: () => Almacen.pref('ajustes', 'cirujano'),
  medico: () => Almacen.pref('ajustes', 'medico'),
  grado: () => Almacen.pref('ajustes', 'grado'),
  firma(nombre = Preferencias.medico(), grado = Preferencias.grado()) {
    if (!(nombre || '').trim()) return '';
    const g = grado === '' ? '' : grado === 'ESPECIALISTA' ? ' (E)' : ` (${grado})`;
    return mayus(nombre.trim()) + g;
  },
};

// ------------------------------------------------------------------ formatos: iniciales, nombre corto, descripción
const INFO = {
  APENDICITIS: ['mod_apendice', 'APENDICITIS', 'Abdomen agudo inflamatorio', '7 hojas: Parte I, II y III, resumen, nota, órdenes y solicitud de intervención'],
  BILIAR: ['mod_higado', 'BILIAR', 'Colecistitis, colangitis, pancreatitis', '10 hojas: las 6 clínicas, solicitud de intervención, hemoderivados e interconsulta (2 hojas)'],
  POLITRAUMA: ['mod_carro', 'POLITRAUMA', 'Trauma abdominal abierto o cerrado', '6 hojas; con intervención agrega la solicitud y los hemoderivados indicados'],
  OBSTRUCCION: ['mod_colon', 'OBSTRUCCIÓN', 'Abdomen agudo obstructivo', '12 hojas: las 6 clínicas, solicitud, CG, PFC, interconsulta (2 hojas) y consentimiento'],
  VASCULAR: ['mod_pie', 'PIE DIABÉTICO', 'Isquemia, úlceras, gangrena, Wagner', '11 hojas: las 6 clínicas, solicitud, CG, interconsulta (2 hojas) y consentimiento'],
  INFECCIONES: ['mod_infeccion', 'INFECCIONES', 'Piel, partes blandas, cuello, absceso odontógeno', '7 hojas: Parte I, II y III (boca, cuello y región afectada), resumen, nota, órdenes con doble antibiótico y solicitud de intervención'],
  COLOPROCT: ['mod_colon', 'PATOLOGÍA ANAL', 'Hemorroides trombosadas, absceso perianal y glúteo', '7 hojas: Parte I, II y III (región anal o glútea), resumen, nota, órdenes con doble antibiótico y solicitud de intervención'],
  PARED: ['mod_abdomen', 'PARED ABDOMINAL', 'Inguinal, crural, umbilical, eventración', '7 hojas: Parte I, II y III, resumen, nota, órdenes y solicitud de intervención'],
  NOTA: ['mod_nota', 'NOTA OPERATORIA', 'Equipo, hallazgos, técnica y diagnóstico', '1 hoja: datos, equipo quirúrgico, anestesia, intervención indicada y realizada, hallazgos, técnica y diagnóstico postoperatorio'],
  RECIPE: ['mod_recipe', 'RÉCIPE', 'Récipe e indicaciones; cita y reposo opcionales', '1 o 2 hojas horizontales: RP e indicaciones; opcional cita y reposo médico'],
  RESP_IC: ['mod_interconsulta', 'RESPUESTA IC', 'Con plantillas por caso', '1 hoja: datos, cama, diagnósticos, examen físico, rastreo, comentario y sugerencias'],
  NOTA_CG: ['mod_notacg', 'NOTA DE CG', 'Valoración sin interconsulta', '1 hoja: datos, enfermedad actual y antecedentes breves, examen físico, comentario y conducta'],
  MATERIALES: ['mod_materiales', 'MATERIALES', 'Quite lo que ya tiene; envíe por WhatsApp', '1 hoja: lista de material médico-quirúrgico; opcional 2da hoja con informe médico'],
  INFORME: ['mod_informe', 'INFORME MÉDICO', 'Materiales, estudios, laboratorios, cuidado', '1 hoja: constancia "SE HACE CONSTAR…" con diagnósticos y motivo'],
  REFERENCIA: ['mod_referencia', 'INFORME ESTUDIO', 'CPRE, endoscopia, colonoscopia, TAC', '1 hoja: diagnósticos, examen, paraclínicos, eco y solicitud del estudio'],
  SOLICITUDES: ['mod_solicitudes', 'SOLICITUDES', 'Intervención, hemoderivados, IC, biopsia, cultivo', 'Elija cuáles: intervención y hemoderivados (original y copia), interconsulta, biopsia y cultivo (4 por hoja)'],
  CONSENTIMIENTO: ['mod_consentimiento', 'CONSENTIMIENTO', 'Riesgos por cirugía; acepta o no acepta', '1 hoja: diagnósticos, planteamiento, riesgos explicados y firmas de paciente y familiar'],
  PROCEDIMIENTO: ['mod_procedimiento', 'PROCEDIMIENTO', 'Tubo de tórax, vía central, paracentesis, VAC…', '1 hoja: nota de procedimiento redactada (7 procedimientos) con nota y fecha'],
  DAMERO: ['mod_curvas', 'DAMERO', 'Laboratorios por día en el formato de la doctora', '1 hoja: el damero de laboratorios tal cual, con los datos del paciente y los valores en sus casillas'],
  CURVAS: ['mod_curvas', 'CURVAS', 'Temperatura, gasto, glicemia, peso', 'Curvas en blanco con papel milimetrado: una por hoja (horizontal) o dos por hoja (vertical)'],
  ELECTIVO: ['mod_electivo', 'ELECTIVO', 'Ficha, checklist, historia y presentación', 'Historia electiva de 10 hojas (Word) y presentación del caso (PowerPoint); checklist de valoraciones y WhatsApp al paciente'],
  ELECTIVO_URO: ['mod_electivo', 'ELECTIVO UROLOGÍA', 'Ficha, checklist e historia de urología', 'Historia electiva de urología (Word, sin fotos ni presentación); checklist de valoraciones y WhatsApp al paciente'],
  ELECTIVO_ORL: ['mod_electivo', 'ELECTIVO ORL', 'Ficha, checklist e historia de otorrinolaringología', 'Historia electiva de otorrinolaringología (Word, sin fotos ni presentación); checklist de valoraciones y WhatsApp al paciente'],
  NPT: ['mod_npt', 'NUTRICIÓN PARENTERAL', 'GEB, GET, volúmenes, bolsa EVA y órdenes', '1–2 hojas: cálculo con su formato (GEB, GET, requerimientos, volúmenes, velocidad) e indicación; órdenes con hidratación ajustada'],
  EVOLUCION: ['mod_evolucion', 'EVOLUCIÓN', 'Evolución diaria y órdenes médicas', '2 hojas: evolución médica (días, diagnósticos, tratamiento, SOAP, plan) y órdenes médicas'],
  EGRESO: ['mod_egreso', 'EGRESO', 'Récipe, indicaciones, resumen y alta', '3 hojas: récipe, indicaciones, cita y reposo o referencia; resumen de egreso (original y copia); órdenes de alta'],
};
const info = (id) => { const i = INFO[id]; return i ? { icono: i[0], corto: i[1], desc: i[2], hojas: i[3] } : { icono: 'formatos', corto: id, desc: '', hojas: '' }; };

// ------------------------------------------------------------------ carpetas del paciente (Carpetas.kt)
const Carpetas = (() => {
  const HOSPITALIZACION = ['NOTA', 'EVOLUCION', 'PROCEDIMIENTO', 'CURVAS', 'NPT', 'EGRESO'];
  const DOCUMENTOS = ['RESP_IC', 'NOTA_CG', 'SOLICITUDES', 'CONSENTIMIENTO', 'INFORME', 'REFERENCIA', 'MATERIALES', 'RECIPE', 'DAMERO'];
  const ELECTIVOS = ['ELECTIVO', 'ELECTIVO_URO', 'ELECTIVO_ORL'];
  const HC = ['APENDICITIS', 'BILIAR', 'POLITRAUMA', 'OBSTRUCCION', 'VASCULAR', 'PARED', 'INFECCIONES', 'COLOPROCT', 'ELECTIVO', 'ELECTIVO_URO', 'ELECTIVO_ORL'];

  const claveNombre = (n) => sinTildes(mayus(n || '')).replace('(COPIA)', '').replace(/[^A-Z0-9Ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
  const sinNombre = (r) => !r.nombre.trim() || r.nombre === '(SIN NOMBRE)';

  function agrupar(todas) {
    const grupos = new Map();
    const nombreDeCedula = new Map();
    const add = (k, r) => { if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(r); };
    for (const r of todas) {
      const c = digitos(r.cedula);
      if (c.length >= 5) {
        const k = 'CI:' + c;
        add(k, r);
        if (!sinNombre(r) && !nombreDeCedula.has(claveNombre(r.nombre))) nombreDeCedula.set(claveNombre(r.nombre), k);
      }
    }
    for (const r of todas) {
      if (digitos(r.cedula).length >= 5) continue;
      const k = sinNombre(r) ? 'ID:' + r.id : (nombreDeCedula.get(claveNombre(r.nombre)) || 'NOM:' + claveNombre(r.nombre));
      add(k, r);
    }
    return [...grupos.entries()].map(([clave, docs]) => {
      const orden = [...docs].sort((a, b) => b.modificado - a.modificado);
      const conNombre = orden.find((x) => !sinNombre(x));
      const tipos = [...new Set(orden.map((x) => x.tipo))];
      return {
        clave,
        nombre: conNombre ? conNombre.nombre.replace(' (COPIA)', '') : '(SIN NOMBRE)',
        cedula: (orden.find((x) => digitos(x.cedula).length >= 5) || {}).cedula || '',
        edad: (orden.find((x) => (x.edad || '').trim()) || {}).edad || '',
        docs: orden,
        tipos,
        ultima: Math.max(0, ...orden.map((x) => x.modificado)),
      };
    }).sort((a, b) => b.ultima - a.ultima);
  }

  function fecha(r) { const d = Fecha.desdeDma(r.fecha); return d ? d.getTime() : r.modificado; }
  function dia(r) { const d = new Date(fecha(r)); return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(); }
  const lineaDeTiempo = (c) => [...c.docs].sort((a, b) => (dia(b) - dia(a)) || (b.modificado - a.modificado));

  function origenPara(tipo, docs) {
    const p = {
      EVOLUCION: ['EVOLUCION', 'NOTA', ...HC],
      EGRESO: ['EGRESO', 'NOTA', 'EVOLUCION', ...HC],
      NOTA: [...HC, 'NOTA', 'CONSENTIMIENTO', 'SOLICITUDES'],
      RECIPE: ['RECIPE', 'EGRESO'],
      CURVAS: ['CURVAS', 'EVOLUCION'],
      NPT: ['NPT', 'EVOLUCION'],
      MATERIALES: ['MATERIALES', ...HC, 'NOTA'], INFORME: ['INFORME', ...HC, 'NOTA'], CONSENTIMIENTO: ['CONSENTIMIENTO', ...HC, 'NOTA'],
      REFERENCIA: ['REFERENCIA', ...HC, 'EVOLUCION'],
    }[tipo] || [];
    const orden = [...docs].sort((a, b) => b.modificado - a.modificado);
    for (const t of p) { const r = orden.find((x) => x.tipo === t); if (r) return r; }
    return orden[0] || null;
  }

  return { HOSPITALIZACION, DOCUMENTOS, ELECTIVOS, claveNombre, agrupar, fecha, lineaDeTiempo, origenPara };
})();

// ------------------------------------------------------------------ agenda (Agenda.kt)
const Agenda = (() => {
  const TIPOS = ['GUARDIA', 'CONSULTA', 'SEMINARIO', 'PRESENTACIÓN', 'QUIRÓFANO', 'ACTIVIDAD'];
  const CIRUGIA = 'CIRUGÍA';
  const REPETIR = ['NO REPETIR', 'CADA SEMANA', 'CADA N DÍAS'];
  const COLORES = { GUARDIA: '#E5484D', CONSULTA: '#1BC7CF', SEMINARIO: '#8E4EC6', 'PRESENTACIÓN': '#F5A524', 'QUIRÓFANO': '#15233B', [CIRUGIA]: '#2E9E5B' };
  const color = (t) => COLORES[t] || '#6B7280';
  const texto = (e) => ((!e.titulo.trim() || e.titulo === e.tipo) ? e.tipo : `${e.tipo}: ${e.titulo}`) + (e.hora ? ` (${Fecha.horaBonita(e.hora)})` : '');

  function propios() {
    try {
      return JSON.parse(Almacen.pref('agenda', 'eventos', '[]')).map((o) => ({
        id: o.id || '', tipo: o.tipo || '', titulo: o.titulo || '', fecha: o.fecha || '', hora: o.hora || '', serie: o.serie || '', historia: '',
      }));
    } catch (_) { return []; }
  }
  async function guardar(l) {
    const orden = [...l].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : 0)));
    await Almacen.ponerPref('agenda', { eventos: JSON.stringify(orden.map((e) => ({ id: e.id, tipo: e.tipo, titulo: e.titulo, fecha: e.fecha, hora: e.hora, serie: e.serie }))) });
  }
  function fechas(fecha, repetir, cada, hasta) {
    const inicio = Fecha.desdeIso(fecha);
    if (!inicio) return [];
    if (repetir === REPETIR[0]) return [fecha];
    const paso = repetir === 'CADA SEMANA' ? 7 : Math.min(60, Math.max(1, cada));
    let fin = Fecha.desdeIso(hasta);
    if (!fin) { fin = new Date(inicio); fin.setMonth(fin.getMonth() + 3); }
    const l = [];
    const c = new Date(inicio);
    while (c <= fin && l.length < 400) { l.push(Fecha.iso(c)); c.setDate(c.getDate() + paso); }
    return l;
  }
  async function agregar(tipo, titulo, fecha, hora, repetir = REPETIR[0], cada = 7, hasta = '') {
    const nuevos = fechas(fecha, repetir, cada, hasta);
    const base = Date.now();
    const serie = nuevos.length > 1 ? 'S' + base : '';
    const l = propios();
    nuevos.forEach((f, i) => l.push({ id: `E${base}_${i}`, tipo, titulo: mayus(titulo.trim()), fecha: f, hora, serie, historia: '' }));
    await guardar(l);
    return nuevos.length;
  }
  async function borrar(e, todaLaSerie) {
    const l = propios();
    const quitar = l.filter((x) => (todaLaSerie && e.serie ? x.serie === e.serie : x.id === e.id));
    for (const x of quitar) await Almacen.marcarBorrado('a:' + x.id);
    await guardar(l.filter((x) => !quitar.includes(x)));
  }
  function cirugias() {
    return Almacen.listar().filter((r) => Carpetas.ELECTIVOS.includes(r.tipo)).map((r) => {
      const d = Almacen.cargar(r.id);
      const f = Fecha.desdeDma(d.el_fecha_qx);
      if (!f) return null;
      const interv = mayus((d.INTERVENCION || '').trim());
      return { id: 'qx:' + r.id, tipo: CIRUGIA, titulo: r.nombre + (interv ? ` – ${interv}` : ''), fecha: Fecha.iso(f), hora: '', serie: '', historia: r.id };
    }).filter(Boolean);
  }
  const todos = () => [...propios(), ...cirugias()].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : ((a.hora || '99') < (b.hora || '99') ? -1 : (a.hora || '99') > (b.hora || '99') ? 1 : 0)));
  const delDia = (f) => todos().filter((e) => e.fecha === f);
  function proximos(dias = 14) {
    const h = Fecha.hoy();
    const fin = new Date(); fin.setDate(fin.getDate() + dias);
    const f = Fecha.iso(fin);
    return todos().filter((e) => e.fecha >= h && e.fecha <= f);
  }
  function aviso(eventos, cuando) {
    if (!eventos.length) return null;
    let titulo;
    if (eventos.length === 1) {
      const e = eventos[0];
      const det = e.titulo.trim() && e.titulo !== e.tipo ? `: ${e.titulo}` : '';
      titulo = {
        GUARDIA: `${cuando} tienes guardia. ¡Prepárate!`,
        CONSULTA: `${cuando} tienes consulta` + (e.hora ? ` a las ${Fecha.horaBonita(e.hora)}` : '') + '.',
        SEMINARIO: `${cuando} tienes seminario${det}.`,
        'PRESENTACIÓN': `${cuando} tienes que dar una presentación${det}.`,
        [CIRUGIA]: `${cuando}: cirugía de ${e.titulo}.`,
      }[e.tipo] || `${cuando}: ${texto(e)}.`;
    } else titulo = `${cuando} tienes ${eventos.length} actividades`;
    return { titulo, lineas: eventos.map(texto) };
  }

  /**
   * Archivo de calendario (.ics) con los eventos de [desde] en adelante y su aviso: el día anterior a la hora elegida
   * (y, si se pidió, el mismo día a las 6:00 AM). El iPhone no permite que una app web programe avisos propios,
   * así que se agregan al Calendario del teléfono, que sí avisa.
   */
  function ics(eventos) {
    const activo = Almacen.pref('ajustes', 'rec_activo', 'SÍ') !== 'NO';
    const [hh, mm] = (Almacen.pref('ajustes', 'rec_hora', '19:00') || '19:00').split(':').map((x) => parseInt(x, 10) || 0);
    const mismoDia = Almacen.pref('ajustes', 'rec_mismo_dia', 'NO') === 'SÍ';
    const esc = (t) => (t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HistoriasCirugia//Agenda 7.0//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Agenda de cirugía'];
    for (const e of eventos) {
      const f = e.fecha.replace(/-/g, '');
      const [eh, em] = (e.hora || '').split(':').map((x) => parseInt(x, 10));
      const conHora = !!e.hora && !isNaN(eh);
      l.push('BEGIN:VEVENT', `UID:${e.id.replace(/[^A-Za-z0-9_:-]/g, '')}@historiascirugia`, `DTSTAMP:${sello}`);
      if (conHora) {
        const ini = `${f}T${Fecha.d2(eh)}${Fecha.d2(em || 0)}00`;
        const finD = new Date(Fecha.desdeIso(e.fecha)); finD.setHours(eh + 1, em || 0);
        l.push(`DTSTART:${ini}`, `DTEND:${Fecha.iso(finD).replace(/-/g, '')}T${Fecha.d2(finD.getHours())}${Fecha.d2(finD.getMinutes())}00`);
      } else {
        const sig = new Date(Fecha.desdeIso(e.fecha)); sig.setDate(sig.getDate() + 1);
        l.push(`DTSTART;VALUE=DATE:${f}`, `DTEND;VALUE=DATE:${Fecha.iso(sig).replace(/-/g, '')}`);
      }
      const unico = aviso([e], 'Mañana');
      l.push(`SUMMARY:${esc(e.tipo === CIRUGIA ? 'CIRUGÍA: ' + e.titulo : texto(e).replace(/ \(\d.*\)$/, ''))}`);
      if (activo) {
        // minutos desde el aviso (día anterior hh:mm) hasta el inicio del evento
        const inicioMin = conHora ? eh * 60 + (em || 0) : 0;
        const antes = 24 * 60 - (hh * 60 + mm) + inicioMin;
        l.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(unico.titulo)}`, `TRIGGER:-PT${antes}M`, 'END:VALARM');
        if (mismoDia) {
          const d = inicioMin - 6 * 60;
          l.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(aviso([e], 'Hoy').titulo)}`, `TRIGGER:${d >= 0 ? '-' : ''}PT${Math.abs(d)}M`, 'END:VALARM');
        }
      }
      l.push('END:VEVENT');
    }
    l.push('END:VCALENDAR');
    return l.join('\r\n') + '\r\n';
  }

  return { TIPOS, CIRUGIA, REPETIR, color, texto, propios, agregar, borrar, cirugias, todos, delDia, proximos, aviso, ics };
})();
