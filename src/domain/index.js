/**
 * Catalogo de entidades del dominio.
 *
 * Exporta las 16 clases del modelo junto con la clase base, los errores y el
 * vocabulario compartido. Las entidades son puras: no conocen la base de
 * datos. El acceso a datos vive en src/repositories y la orquestacion de
 * casos de uso en src/services.
 */

export { Entidad, Tipos } from './base/Entidad.js';
export { ErrorReglaNegocio, desdeErrorMysql, REGLAS_POR_ERRNO } from './base/ErrorReglaNegocio.js';
export * from './base/vocabulario.js';

export { Cliente } from './Cliente.js';
export { Equipo } from './Equipo.js';
export { OrdenServicio, DetalleServicio } from './OrdenServicio.js';
export { Tecnico } from './Tecnico.js';
export { Repuesto } from './Repuesto.js';
export { Pago, ComprobantePago } from './Pago.js';
export { Proveedor, MovimientoEconomico } from './Proveedor.js';
export { Mensaje } from './Mensaje.js';
export { Rol, Usuario, Plan, Suscripcion } from './Usuario.js';
