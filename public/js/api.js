/* ==========================================================================
   Cliente HTTP del frontend.
   Concentra el token, el formato de peticion y el manejo de errores, para que
   ningun modulo tenga que conocer los detalles del transporte.
   ========================================================================== */

const BASE = '/api';
const CLAVE_TOKEN = 'taller.token';
const CLAVE_USUARIO = 'taller.usuario';

/** Error de negocio devuelto por la API, con su codigo HTTP y su regla. */
export class ErrorApi extends Error {
  constructor(mensaje, { estado = 0, regla = null } = {}) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.regla = regla;
  }
}

export const sesion = {
  get token() { return localStorage.getItem(CLAVE_TOKEN); },
  get usuario() {
    try { return JSON.parse(localStorage.getItem(CLAVE_USUARIO) ?? 'null'); }
    catch { return null; }
  },
  abrir(token, usuario) {
    localStorage.setItem(CLAVE_TOKEN, token);
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
  },
  cerrar() {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
  },
  get iniciada() { return Boolean(this.token); },
};

/** Agrega los parametros de consulta, descartando los vacios. */
function conQuery(ruta, query) {
  const vacios = Object.entries(query ?? {}).filter(
    ([, valor]) => valor !== undefined && valor !== null && valor !== '',
  );
  if (!vacios.length) return ruta;
  const cadena = new URLSearchParams(vacios.map(([k, v]) => [k, v])).toString();
  return `${ruta}${ruta.includes('?') ? '&' : '?'}${cadena}`;
}

async function peticion(metodo, ruta, cuerpo) {
  const cabeceras = {};
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (sesion.token) cabeceras.Authorization = `Bearer ${sesion.token}`;

  let respuesta;
  try {
    respuesta = await fetch(BASE + ruta, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi('No hay conexion con el servidor', { estado: 0 });
  }

  const texto = await respuesta.text();
  let cuerpoRespuesta = null;
  try { cuerpoRespuesta = texto ? JSON.parse(texto) : null; } catch { cuerpoRespuesta = null; }

  if (!respuesta.ok) {
    if (respuesta.status === 401) sesion.cerrar();
    throw new ErrorApi(
      cuerpoRespuesta?.error ?? `Error ${respuesta.status}`,
      { estado: respuesta.status, regla: cuerpoRespuesta?.regla ?? null },
    );
  }

  return cuerpoRespuesta?.datos ?? cuerpoRespuesta;
}

export const api = {
  get: (ruta, query) => peticion('GET', conQuery(ruta, query)),
  post: (ruta, cuerpo) => peticion('POST', ruta, cuerpo ?? {}),
  put: (ruta, cuerpo) => peticion('PUT', ruta, cuerpo ?? {}),
  patch: (ruta, cuerpo) => peticion('PATCH', ruta, cuerpo ?? {}),
  eliminar: (ruta) => peticion('DELETE', ruta),

  async iniciarSesion(email, password) {
    const respuesta = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const datos = await respuesta.json().catch(() => null);

    if (!respuesta.ok) {
      throw new ErrorApi(datos?.error ?? 'No se pudo iniciar sesion', { estado: respuesta.status });
    }
    sesion.abrir(datos.token, datos.usuario);
    return datos.usuario;
  },

  async cerrarSesion() {
    try { await peticion('POST', '/auth/logout', {}); } catch { /* la sesion local se cierra igual */ }
    sesion.cerrar();
  },
};
