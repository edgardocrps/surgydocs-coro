// 8.3: cuenta de Google y sincronización (misma idea que Nube.kt de Android). Las historias viajan en el .zip de la copia de
// seguridad a la carpeta oculta de la app en el Google Drive del médico (appDataFolder). Cada sincronización baja y mezcla
// lo que hay en Drive y después sube el resultado. Por ahora solo en la app de Windows: el programa abre el navegador para
// iniciar sesión y entrega el token de acceso; aquí se habla con Drive.
const Nube = (() => {
  const API = 'https://www.googleapis.com/drive/v3';
  const SUBIDA = 'https://www.googleapis.com/upload/drive/v3';
  const ARCHIVO = INSTITUCION.archivoNube;
  // iPhone / navegador: ID de cliente OAuth de tipo "Aplicación web" (se completa al publicar la página). Vacío = sin login.
  const CLIENTE_WEB = '1049586329837-hbes0gg62f88ig6u9o69ssmg6l25jagp.apps.googleusercontent.com';
  const PERMISO = 'https://www.googleapis.com/auth/drive.appdata';
  const enWeb = !enAppWindows && !!CLIENTE_WEB && location.protocol === 'https:';
  const disponible = () => enAppWindows || enWeb;

  const cuenta = () => Almacen.pref('nube', 'cuenta', '');
  const cuentaAnterior = () => Almacen.pref('nube', 'anterior', '');
  const ultimaSync = () => parseInt(Almacen.pref('nube', 'sync', '0'), 10) || 0;
  const necesitaReconectar = () => Almacen.pref('nube', 'reconectar', '') === 'si';
  const avisarPrograma = (activa) => { if (enAppWindows) window.chrome.webview.postMessage({ tipo: 'sesion', activa: activa ? '1' : '0' }); };

  async function iniciarSesion(correo) {
    await Almacen.ponerPref('nube', { cuenta: correo, anterior: correo, reconectar: '' });
    avisarPrograma(true);
  }
  /** true si la persona eligió usar la app de forma normal, sin cuenta de Google. */
  const omitido = () => Almacen.pref('nube', 'omitido', '') === 'si';
  const omitir = () => Almacen.ponerPref('nube', { omitido: 'si' });

  async function cerrarSesion() {
    // Cerrar sesión deja la app en modo normal (sin cuenta): no vuelve a pedir el inicio de sesión
    await Almacen.ponerPref('nube', { cuenta: '', sync: '0', reconectar: '', omitido: 'si' });
    avisarPrograma(false);
    if (enAppWindows) window.chrome.webview.postMessage({ tipo: 'google_salir' });
    if (enWeb && tokenWeb && gisListo()) { try { google.accounts.oauth2.revoke(tokenWeb); } catch (_) {} tokenWeb = ''; venceWeb = 0; }
  }

  // ------------------------------------------------------------------ token (lo entrega el programa de Windows)

  const pendientes = new Map();
  let numero = 0;
  if (enAppWindows) {
    window.chrome.webview.addEventListener('message', (e) => {
      const m = e.data || {};
      if (m.tipo !== 'google_entrar' && m.tipo !== 'google_token') return;
      const p = pendientes.get(m.tipo === 'google_entrar' ? 'entrar' : m.id);
      if (p) { pendientes.delete(m.tipo === 'google_entrar' ? 'entrar' : m.id); p(m); }
    });
  }
  // ---- iPhone / navegador: Google Identity Services (ventana de Google). El token dura ~1 hora y no se renueva solo:
  // al vencer, el siguiente toque en la pantalla lo renueva (el navegador solo permite la ventana tras un toque).
  let tokenWeb = '', venceWeb = 0, esperandoToque = false;
  const gisListo = () => !!(window.google && google.accounts && google.accounts.oauth2);
  function cargarGis() {
    return new Promise((ok, mal) => {
      if (gisListo()) return ok();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => ok(); s.onerror = () => mal(new Error('Sin conexión a internet'));
      document.head.append(s);
    });
  }
  if (enWeb) cargarGis().catch(() => {});

  function pedirWeb(prompt) {
    return new Promise((ok) => {
      const hecho = (r) => ok(r);
      const abrir = () => {
        try {
          google.accounts.oauth2.initTokenClient({
            client_id: CLIENTE_WEB, scope: PERMISO, prompt,
            callback: (r) => {
              if (r && r.access_token) { tokenWeb = r.access_token; venceWeb = Date.now() + Math.max(60, (r.expires_in || 3600) - 120) * 1000; hecho({ token: tokenWeb }); }
              else hecho({ token: '', error: 'reconectar', detalle: (r && r.error) || '' });
            },
            error_callback: (e) => hecho({ token: '', error: e && e.type === 'popup_closed' ? 'cancelado' : 'reconectar', detalle: (e && e.type) || '' }),
          }).requestAccessToken();
        } catch (e) { hecho({ token: '', error: 'red', detalle: e.message }); }
      };
      if (gisListo()) abrir();     // sin esperas: la ventana debe abrirse dentro del toque del usuario
      else cargarGis().then(abrir, (e) => hecho({ token: '', error: 'red', detalle: e.message }));
    });
  }
  function renovarAlTocar() {
    if (esperandoToque) return;
    esperandoToque = true;
    document.addEventListener('pointerup', async () => {
      esperandoToque = false;
      const r = await pedirWeb('');
      if (!r.token && r.error === 'reconectar') await Almacen.ponerPref('nube', { reconectar: 'si' });
      document.dispatchEvent(new Event('nube-token'));
    }, { once: true, capture: true });
  }

  function pedir(tipo, clave) {
    if (enWeb) {
      if (tipo === 'google_entrar') return pedirWeb('select_account');
      if (tokenWeb && Date.now() < venceWeb) return Promise.resolve({ token: tokenWeb });
      renovarAlTocar();
      return Promise.resolve({ token: '', error: 'toque', detalle: 'Toque la pantalla para renovar la sesión' });
    }
    return new Promise((ok) => {
      pendientes.set(clave, ok);
      window.chrome.webview.postMessage({ tipo, id: clave });
      setTimeout(() => { if (pendientes.get(clave) === ok) { pendientes.delete(clave); ok({ token: '', error: 'red', detalle: 'Tiempo de espera agotado' }); } }, tipo === 'google_entrar' ? 200000 : 40000);
    });
  }
  /** Inicio de sesión interactivo (abre el navegador). */
  const tokenEntrar = () => pedir('google_entrar', 'entrar');
  /** Token vigente sin interacción. */
  const tokenSilencioso = () => pedir('google_token', 't' + (++numero));

  // ------------------------------------------------------------------ Drive

  async function drive(url, token, opciones = {}) {
    const r = await fetch(url, { ...opciones, headers: { Authorization: 'Bearer ' + token, ...(opciones.headers || {}) } });
    if (!r.ok) {
      let motivo = '';
      try { motivo = (await r.json()).error.message || ''; } catch (_) {}
      throw new Error(`Drive respondió ${r.status}` + (motivo ? ': ' + motivo.slice(0, 160) : ''));
    }
    return r;
  }

  async function correo(token) {
    const o = await (await drive(`${API}/about?fields=user(emailAddress)`, token)).json();
    return (o.user && o.user.emailAddress) || 'Cuenta de Google';
  }

  async function buscar(token) {
    const q = encodeURIComponent(`name='${ARCHIVO}'`);
    const o = await (await drive(`${API}/files?spaces=appDataFolder&q=${q}&orderBy=createdTime&fields=files(id)&pageSize=1`, token)).json();
    return o.files && o.files.length ? o.files[0].id : null;
  }

  async function subir(token, id, blob) {
    if (id) {
      await drive(`${SUBIDA}/files/${id}?uploadType=media`, token, { method: 'PATCH', headers: { 'Content-Type': 'application/zip' }, body: blob });
    } else {
      const borde = 'surgydocs' + Date.now();
      const meta = JSON.stringify({ name: ARCHIVO, parents: ['appDataFolder'] });
      const cuerpo = new Blob([`--${borde}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${borde}\r\nContent-Type: application/zip\r\n\r\n`, blob, `\r\n--${borde}--`]);
      await drive(`${SUBIDA}/files?uploadType=multipart`, token, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${borde}` }, body: cuerpo });
    }
  }

  let ocupado = false;

  /** Baja lo de Drive, lo mezcla con lo de este equipo y sube el resultado. Devuelve false si ya había una en curso. */
  async function sincronizarConToken(token) {
    if (ocupado) return false;
    ocupado = true;
    try {
      const id = await buscar(token);
      if (id) {
        const r = await drive(`${API}/files/${id}?alt=media`, token);
        await Copia.restaurar(await r.blob(), true);
      }
      const { blob } = await Copia.exportar(false);
      await subir(token, id, blob);
      await Almacen.ponerPref('nube', { sync: String(Date.now()), reconectar: '' });
      return true;
    } finally { ocupado = false; }
  }

  const firmaDatos = () => Almacen.listar().map((r) => r.id + r.modificado).join(',') + '|' + Almacen.pref('agenda', 'eventos', '');

  /**
   * Sincroniza sin interacción. Devuelve { ok, error, cambio }: error es null si salió bien; "reconectar" si hay que
   * iniciar sesión de nuevo (queda marcado para avisar en el Inicio); cambio = los datos cambiaron (hay que redibujar).
   */
  async function sincronizar() {
    if (!disponible() || !cuenta()) return { ok: false, error: 'sin sesión', cambio: false };
    const antes = firmaDatos();
    try {
      const t = await tokenSilencioso();
      if (!t.token) {
        if (t.error === 'reconectar') await Almacen.ponerPref('nube', { reconectar: 'si' });
        return { ok: false, error: t.error === 'reconectar' ? 'reconectar' : (t.error === 'toque' ? 'Toque la pantalla para renovar la sesión de Google' : 'Sin conexión a internet'), cambio: false };
      }
      const hecho = await sincronizarConToken(t.token);
      return { ok: hecho, error: hecho ? null : 'Ya hay una sincronización en curso', cambio: hecho && firmaDatos() !== antes };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : 'No se pudo sincronizar', cambio: false };
    }
  }

  /**
   * Inicio de sesión con el navegador. Devuelve { error } o { correo, token }; el llamador decide cómo seguir
   * (ver completarInicio) porque puede haber que preguntar si el equipo traía pacientes de otra cuenta.
   */
  async function entrar() {
    const r = await tokenEntrar();
    if (!r.token) return { error: r.error === 'cancelado' ? 'Se canceló el inicio de sesión.' : `No se pudo iniciar sesión${r.detalle ? ' (' + r.detalle + ')' : ''}. Revise la conexión a internet.` };
    try { return { correo: await correo(r.token), token: r.token }; }
    catch (e) { return { error: `No se pudo leer la cuenta (${e.message}). Revise que la Google Drive API esté habilitada.` }; }
  }

  async function completarInicio(correoCuenta, token) {
    await iniciarSesion(correoCuenta);
    try { await sincronizarConToken(token); return true; } catch (_) { return false; }
  }

  return { ocupado: () => ocupado, disponible, omitido, omitir, cuenta, cuentaAnterior, ultimaSync, necesitaReconectar, iniciarSesion, cerrarSesion, avisarPrograma, entrar, completarInicio, sincronizar, tokenSilencioso, sincronizarConToken, firmaDatos };
})();
