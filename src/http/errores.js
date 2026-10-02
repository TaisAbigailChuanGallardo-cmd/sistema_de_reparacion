import { ErrorReglaNegocio } from '../domain/index.js';

/**
 * Envuelve un manejador asincrono para que los rechazos lleguen al middleware
 * de errores en lugar de quedarse como promesas no capturadas.
 * @param {(req, res, next) => Promise<any>} manejador
 */
export function asincrono(manejador) {
  return (req, res, next) => Promise.resolve(manejador(req, res, next)).catch(next);
}

/**
 * Error de peticion: no viene del dominio sino de que la peticion esta mal
 * formada (falta un campo, un id no es numerico, un estado no existe).
 * Se distingue del ErrorReglaNegocio para responder 400 y no 422.
 */
export class ErrorPeticion extends Error {
  constructor(mensaje, codigo = 400) {
    super(mensaje);
    this.name = 'ErrorPeticion';
    this.codigo = codigo;
  }
}

/** Error de autenticacion o de permisos: 401 o 403. */
export class ErrorAcceso extends Error {
  constructor(mensaje, codigo = 401) {
    super(mensaje);
    this.name = 'ErrorAcceso';
    this.codigo = codigo;
  }
}

/**
 * Middleware final de errores.
 * Traduce cada tipo de fallo al codigo HTTP correspondiente y siempre
 * responde en JSON, para que el frontend tenga un unico formato de error.
 */
export function manejadorDeErrores(error, req, res, _next) {
  const contexto = {
    ruta: req.originalUrl,
    metodo: req.method,
  };

  if (error instanceof ErrorAcceso) {
    return res.status(error.codigo).json({
      ok: false,
      error: error.message,
      ...contexto,
    });
  }

  if (error instanceof ErrorPeticion) {
    return res.status(error.codigo).json({
      ok: false,
      error: error.message,
      ...contexto,
    });
  }

  if (error instanceof ErrorReglaNegocio) {
    // 422: la peticion se entiende, pero una regla de negocio la rechaza.
    return res.status(422).json({
      ok: false,
      error: error.message,
      regla: error.regla,
      ...contexto,
    });
  }

  if (error?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      ok: false,
      error: 'Ya existe un registro con esos datos unicos',
      ...contexto,
    });
  }

  if (error?.code === 'ER_NO_REFERENCED_ROW_2' || error?.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({
      ok: false,
      error: 'La operacion afecta registros relacionados y no se puede completar',
      ...contexto,
    });
  }

  console.error('[error no controlado]', error);
  return res.status(500).json({
    ok: false,
    error: 'Error interno del servidor',
    ...contexto,
  });
}

/** 404 para rutas no registradas. */
export function noEncontrado(req, res) {
  res.status(404).json({
    ok: false,
    error: `No existe el recurso ${req.method} ${req.originalUrl}`,
  });
}
