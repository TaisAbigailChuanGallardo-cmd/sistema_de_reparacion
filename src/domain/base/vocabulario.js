/**
 * Vocabulario del dominio.
 *
 * Los valores coinciden exactamente con los ENUM declarados en
 * database/01_schema.sql. Centralizarlos aqui evita que el diagrama de
 * estados se disperse entre el backend, el SQL y el frontend.
 */

/** Diagrama de estados de la orden (apartado 10.2 del documento). */
export const ESTADO_ORDEN = Object.freeze({
  RECIBIDO: 'RECIBIDO',
  EN_DIAGNOSTICO: 'EN_DIAGNOSTICO',
  PRESUPUESTADO: 'PRESUPUESTADO',
  EN_REPARACION: 'EN_REPARACION',
  LISTO: 'LISTO',
  ENTREGADO: 'ENTREGADO',
  CANCELADO: 'CANCELADO',
});

export const ESTADOS_ORDEN = Object.freeze(Object.values(ESTADO_ORDEN));

/**
 * Transiciones permitidas. Una orden solo avanza por esta tabla; el avance
 * lateral (retroceder de LISTO a EN_REPARACION) se permite cuando el taller
 * detecta un problema en la garantia, de ahi las flechas de retorno.
 */
export const TRANSICIONES_ORDEN = Object.freeze({
  RECIBIDO: ['EN_DIAGNOSTICO', 'CANCELADO'],
  EN_DIAGNOSTICO: ['PRESUPUESTADO', 'CANCELADO'],
  PRESUPUESTADO: ['EN_REPARACION', 'EN_DIAGNOSTICO', 'CANCELADO'],
  EN_REPARACION: ['LISTO', 'EN_DIAGNOSTICO', 'CANCELADO'],
  LISTO: ['ENTREGADO', 'EN_REPARACION', 'CANCELADO'],
  ENTREGADO: [],
  CANCELADO: [],
});

/** Estados en los que la orden sigue abierta y ocupa al tecnico (RN-07). */
export const ESTADOS_ACTIVOS_ORDEN = Object.freeze([
  ESTADO_ORDEN.RECIBIDO,
  ESTADO_ORDEN.EN_DIAGNOSTICO,
  ESTADO_ORDEN.PRESUPUESTADO,
  ESTADO_ORDEN.EN_REPARACION,
  ESTADO_ORDEN.LISTO,
]);

/** Estados que el diagrama refleja sobre el equipo. */
export const ESTADO_EQUIPO = Object.freeze({
  EN_TALLER: 'EN_TALLER',
  EN_DIAGNOSTICO: 'EN_DIAGNOSTICO',
  EN_REPARACION: 'EN_REPARACION',
  LISTO: 'LISTO',
  ENTREGADO: 'ENTREGADO',
  DE_BAJA: 'DE_BAJA',
});

export const TIPO_EQUIPO = Object.freeze({
  CELULAR: 'CELULAR',
  TABLET: 'TABLET',
  LAPTOP: 'LAPTOP',
  COMPUTADORA: 'COMPUTADORA',
  IMPRESORA: 'IMPRESORA',
  OTRO: 'OTRO',
});

export const TIPO_DOCUMENTO = Object.freeze({
  DNI: 'DNI',
  CE: 'CE',
  PASAPORTE: 'PASAPORTE',
  RUC: 'RUC',
});

/** Conceptos que pueden integrar el costo de una orden (RN-05). */
export const CONCEPTO_SERVICIO = Object.freeze({
  DIAGNOSTICO: 'DIAGNOSTICO',
  REPUESTO: 'REPUESTO',
  MANO_DE_OBRA: 'MANO_DE_OBRA',
  SERVICIO_ADICIONAL: 'SERVICIO_ADICIONAL',
});

export const CONCEPTOS_SERVICIO = Object.freeze(Object.values(CONCEPTO_SERVICIO));

/** Solo estos conceptos mueven el inventario (RN-04). */
export const CONCEPTOS_CON_STOCK = Object.freeze([CONCEPTO_SERVICIO.REPUESTO]);

export const METODO_PAGO = Object.freeze({
  EFECTIVO: 'EFECTIVO',
  TARJETA_DEBITO: 'TARJETA_DEBITO',
  TARJETA_CREDITO: 'TARJETA_CREDITO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  YAPE: 'YAPE',
  PLIN: 'PLIN',
  OTRO: 'OTRO',
});

export const TIPO_MOVIMIENTO = Object.freeze({
  INGRESO: 'INGRESO',
  EGRESO: 'EGRESO',
});

export const CATEGORIA_MOVIMIENTO = Object.freeze({
  VENTA: 'VENTA',
  ABONO: 'ABONO',
  COMPRA_REPUESTO: 'COMPRA_REPUESTO',
  GASTO_OPERATIVO: 'GASTO_OPERATIVO',
  SERVICIO: 'SERVICIO',
  IMPUESTO: 'IMPUESTO',
  OTRO: 'OTRO',
});

export const PRIORIDAD_ORDEN = Object.freeze({
  BAJA: 'BAJA',
  NORMAL: 'NORMAL',
  ALTA: 'ALTA',
  URGENTE: 'URGENTE',
});

export const TIPO_MENSAJE = Object.freeze({
  SISTEMA: 'SISTEMA',
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
});

export const TIPO_COMPROBANTE = Object.freeze({
  BOLETA: 'BOLETA',
  FACTURA: 'FACTURA',
});

export const TIPO_SUSCRIPCION = Object.freeze({
  ACTIVA: 'ACTIVA',
  SUSPENDIDA: 'SUSPENDIDA',
  CANCELADA: 'CANCELADA',
  VENCIDA: 'VENCIDA',
});

export const PERIODICIDAD_PLAN = Object.freeze({
  MENSUAL: 'MENSUAL',
  TRIMESTRAL: 'TRIMESTRAL',
  SEMESTRAL: 'SEMESTRAL',
  ANUAL: 'ANUAL',
});

/**
 * Indica si la transicion de un estado a otro respeta el diagrama.
 * @param {string} desde
 * @param {string} hacia
 */
export function transicionPermitida(desde, hacia) {
  return (TRANSICIONES_ORDEN[desde] ?? []).includes(hacia);
}
