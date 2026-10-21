// 7.0: vista previa de las hojas sin salir de la app (docx-preview dibuja el Word en la pantalla).
const VistaPrevia = (() => {
  async function mostrar(blob, hoja, avisoTexto, nombre) {
    const paginas = h('div.vp-paginas');
    const marco = h('div.vp-marco', paginas);
    const cerrar = () => { capa.remove(); document.removeEventListener('keydown', esc); window.removeEventListener('resize', ajustar); };
    const esc = (e) => { if (e.key === 'Escape') cerrar(); };
    const capa = h('div.vista-previa',
      h('header.vp-cabecera',
        h('button.ed-atras', { type: 'button', 'aria-label': 'Cerrar', onclick: cerrar }, icono('cerrar')),
        h('div.vp-titulo', 'VISTA PREVIA', h('small', hoja > 1 ? `HOJA ${hoja}` : 'DOCUMENTO COMPLETO')),
        boton('Compartir', 'compartir', 'cian chico', () => compartirArchivo(blob, nombre))),
      avisoTexto ? h('div.vp-aviso', avisoTexto) : null,
      marco);
    document.body.append(capa);
    document.addEventListener('keydown', esc);
    try {
      const paraVer = await saltosDePagina(blob);
      await docx.renderAsync(paraVer, paginas, null, {
        className: 'docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true,
        ignoreLastRenderedPageBreak: true, renderHeaders: true, renderFooters: true, useBase64URL: true,
      });
    } catch (e) {
      paginas.append(h('div.vp-error', 'No se pudo dibujar la vista previa. Use "Abrir" o "Compartir" para verlo en Word.'));
      return;
    }
    ajustar();
    window.addEventListener('resize', ajustar);
    const secciones = paginas.querySelectorAll('section.docx');
    const destino = secciones[Math.max(0, Math.min(hoja - 1, secciones.length - 1))];
    if (destino && hoja > 1) setTimeout(() => destino.scrollIntoView({ block: 'start' }), 60);

    function ajustar() {
      // Las hojas miden 21,6 cm de ancho: se reducen para que quepan en la pantalla del teléfono
      const s = paginas.querySelector('section.docx');
      if (!s) return;
      paginas.style.zoom = '';
      const ancho = s.getBoundingClientRect().width + 24;
      const disponible = marco.clientWidth - 8;
      paginas.style.zoom = ancho > disponible ? String(disponible / ancho) : '';
    }
  }
  /**
   * Las hojas de las plantillas empiezan con "salto de página antes" en el párrafo (PARTE II, NOTA…), que
   * docx-preview no separa: se agrega un salto de página explícito solo para la vista previa (el Word no cambia).
   */
  async function saltosDePagina(blob) {
    try {
      const zip = await JSZip.loadAsync(blob);
      const f = zip.file('word/document.xml');
      if (!f) return blob;
      let x = await f.async('string');
      let n = 0;
      x = x.replace(/<w:pPr>((?:(?!<\/w:pPr>)[\s\S])*?<w:pageBreakBefore(?: w:val="(?:1|true|on)")?\/>(?:(?!<\/w:pPr>)[\s\S])*?)<\/w:pPr>/g,
        (m, dentro) => { n++; return `<w:pPr>${dentro}</w:pPr><w:r><w:br w:type="page"/></w:r>`; });
      if (!n) return blob;
      zip.file('word/document.xml', x);
      return await zip.generateAsync({ type: 'blob' });
    } catch (_) { return blob; }
  }

  return { mostrar };
})();
