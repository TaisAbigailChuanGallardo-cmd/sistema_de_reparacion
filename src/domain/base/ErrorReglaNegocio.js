/**
 * ErrorReglaNegocio
 *
 * Representa el incumplimiento de una regla de negocio (RN-01 a RN-07).
 * Los triggers de MySQL lancan sus propias excepciones con MYSQL_ERRNO
 * entre 45001 y 45007; la capa HTTP traduce unas y otras al mismo formato
 * de respuesta, de modo que el frontend no distingue si el rechazo vino del
 * servidor de base de datos o de la capa de dominio.
 */
export class ErrorReglaNegocio extends Error {
  /**
   * @param {string} mensaje Texto legible para el usuario.
   * @param {string} regla    Codigo de la regla, p. ej. "RN-01".
   */
  constructor(mensaje, regla) {
    super(mensaje);
    this.name = 'ErrorReglaNegocio';
    this.regla = regla ?? null;
  }
}

/** Tabla de equivalencia entre el MYSQL_ERRNO de los triggers y la regla. */
export const REGLAS_POR_ERRNO = Object.freeze({
  45001: 'RN-01',
  45002: 'RN-02',
  45003: 'RN-03',
  45004: 'RN-04',
  45005: 'RN-05',
  45006: 'RN-06',
  45007: 'RN-07',
});

/** Construye el error de dominio a partir del error devuelto por MySQL. */
export function desdeErrorMysql(error) {
  const errno = error?.errno;
  if (errno && REGLAS_POR_ERRNO[errno]) {
    return new ErrorReglaNegocio(error.sqlMessage ?? error.message, REGLAS_POR_ERRNO[errno]);
  }
  return error;
}
