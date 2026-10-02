import { Entidad } from './base/Entidad.js';
import { ErrorReglaNegocio } from './base/ErrorReglaNegocio.js';
import {
  CONCEPTOS_CON_STOCK,
  ESTADO_ORDEN,
  PRIORIDAD_ORDEN,
  transicionPermitida,
} from './base/vocabulario.js';

/**
 * DetalleServicio
 *
 * Responsabilidad: "Define los servicios y repuestos utilizados en la orden".
 *
 * Es la clase que materializa la multiplicidad
 *   OrdenServicio 1 -> 0..* DetalleServicio -> 1 Repuesto
 * del documento, y a la vez el origen de los repuestos dentro del costo final.
 *
 * El subtotal y la marca de afecta_stock no se escriben desde aqui: los
 * calcula el trigger (RN-04 y RN-05).
 */
export class DetalleServicio extends Entidad {
  static TABLA = 'detalle_servicio';

  static CAMPOS = {
    id_detalle:     { tipo: 'entero',  soloLectura: true },
    id_orden:       { tipo: 'entero',  requerido: true },
    id_repuesto:    { tipo: 'entero' },
    concepto:       { tipo: 'texto',   dominio: [...CONCEPTOS_CON_STOCK, 'DIAGNOSTICO', 'MANO_DE_OBRA', 'SERVICIO_ADICIONAL'], requerido: true },
    descripcion:    { tipo: 'texto',   requerido: true },
    cantidad:       { tipo: 'entero',  porDefecto: 1 },
    costo_unitario: { tipo: 'decimal' },
    subtotal:       { tipo: 'decimal', soloLectura: true, porDefecto: 0 },
    afecta_stock:   { tipo: 'booleano', soloLectura: true, porDefecto: 0 },
    created_at:     { tipo: 'datetime', soloLectura: true },
  };

  static ETIQUETAS = {
    id_orden: 'orden de servicio',
    id_repuesto: 'repuesto',
    concepto: 'concepto',
    descripcion: 'descripcion',
    cantidad: 'cantidad',
    costo_unitario: 'costo unitario',
  };

  /**
   * registrar() - agrega un concepto a la orden.
   * @param {object} datos
   * @returns {DetalleServicio}
   */
  static registrar(datos) {
    const detalle = new DetalleServicio(datos);

    if (detalle.obtener('cantidad') < 1) {
      throw new ErrorReglaNegocio('La cantidad debe ser al menos 1', 'validacion');
    }

    // Un detalle de repuesto sin repuesto es el caso que la RN-04 prohibe.
    if (detalle.obtener('concepto') === 'REPUESTO' && !detalle.obtener('id_repuesto')) {
      throw new ErrorReglaNegocio(
        'Un detalle de tipo REPUESTO debe indicar el repuesto utilizado',
        'RN-04',
      );
    }

    return detalle;
  }

  /** Indica si este concepto descuenta existencia del inventario. */
  get consumeStock() {
    return CONCEPTOS_CON_STOCK.includes(this.obtener('concepto'));
  }
}

/**
 * OrdenServicio
 *
 * Clase central del proceso: "Registra la orden, su estado y la informacion
 * economica del servicio" (seccion 3 del documento). Concentra la
 * informacion necesaria para el seguimiento tecnico y economico de una
 * reparacion (apartado 8.2).
 *
 * Diagrama de estados:
 *   RECIBIDO -> EN_DIAGNOSTICO -> PRESUPUESTADO -> EN_REPARACION
 *             -> LISTO -> ENTREGADO
 *
 * Los datos calculados (costo_final, total_pagado, saldo) los escribe el
 * trigger trg_orden_costo_bu y sp_actualizar_costo_orden; esta clase no los
 * puede modificar, solo leerlos.
 */
export class OrdenServicio extends Entidad {
  static TABLA = 'orden_servicio';

  static CAMPOS = {
    id_orden:            { tipo: 'entero',  soloLectura: true },
    numero:              { tipo: 'texto',   soloLectura: true },
    id_cliente:          { tipo: 'entero',  requerido: true },
    id_equipo:           { tipo: 'entero',  requerido: true },
    id_tecnico:          { tipo: 'entero' },
    id_usuario_registro: { tipo: 'entero' },
    estado:              { tipo: 'texto',   soloLectura: true, porDefecto: ESTADO_ORDEN.RECIBIDO },
    fecha_recepcion:     { tipo: 'datetime', soloLectura: true },
    fecha_diagnostico:   { tipo: 'datetime', soloLectura: true },
    fecha_aprobacion:    { tipo: 'datetime', soloLectura: true },
    fecha_entrega:       { tipo: 'datetime', soloLectura: true },
    falla_reportada:     { tipo: 'texto' },
    diagnostico:         { tipo: 'texto' },
    solucion:            { tipo: 'texto' },
    costo_diagnostico:   { tipo: 'decimal', porDefecto: 0 },
    costo_mano_obra:     { tipo: 'decimal', porDefecto: 0 },
    costo_adicional:     { tipo: 'decimal', porDefecto: 0 },
    descuento:           { tipo: 'decimal', porDefecto: 0 },
    costo_final:         { tipo: 'decimal', soloLectura: true, porDefecto: 0 },
    total_pagado:        { tipo: 'decimal', soloLectura: true, porDefecto: 0 },
    saldo:               { tipo: 'decimal', soloLectura: true, porDefecto: 0 },
    prioridad:           { tipo: 'texto',   dominio: Object.values(PRIORIDAD_ORDEN), porDefecto: PRIORIDAD_ORDEN.NORMAL },
    garantia_dias:       { tipo: 'entero',  porDefecto: 0 },
    observaciones:       { tipo: 'texto' },
    created_at:          { tipo: 'datetime', soloLectura: true },
    updated_at:          { tipo: 'datetime', soloLectura: true },
  };

  static ETIQUETAS = {
    id_cliente: 'cliente',
    id_equipo: 'equipo',
    id_tecnico: 'tecnico asignado',
    diagnostico: 'diagnostico',
    costo_diagnostico: 'costo de diagnostico',
    costo_mano_obra: 'costo de mano de obra',
    costo_adicional: 'costos adicionales',
    descuento: 'descuento',
    prioridad: 'prioridad',
  };

  // ---------------------------------------------------------------------------
  // Operaciones del documento
  // ---------------------------------------------------------------------------

  /**
   * generar() - abre una orden. El numero unico lo asigna el trigger
   * trg_orden_numero_ai (RF-03), por eso no se exige aqui.
   * @param {object} datos
   * @returns {OrdenServicio}
   */
  static generar(datos) {
    const orden = new OrdenServicio({
      prioridad: PRIORIDAD_ORDEN.NORMAL,
      ...datos,
      estado: ESTADO_ORDEN.RECIBIDO,
    });

    if (!orden.obtener('falla_reportada')) {
      throw new ErrorReglaNegocio(
        'La orden requiere la falla reportada por el cliente',
        'validacion',
      );
    }
    return orden;
  }

  /**
   * actualizarEstado() - avanza la orden por el diagrama de estados.
   * Las RN-02 y RN-03 tambien se verifican aqui, para anticipar un error
   * claro al usuario; el trigger las vuelve a validar como garantia final.
   * @param {string} estado
   * @param {object} contexto Datos del avance: id_tecnico, diagnostico, solucion.
   * @returns {this}
   */
  actualizarEstado(estado, contexto = {}) {
    const actual = this.obtener('estado');

    if (!transicionPermitida(actual, estado)) {
      throw new ErrorReglaNegocio(
        `No se permite pasar de ${actual} a ${estado}`,
        'validacion',
      );
    }

    // ---- RN-02: tecnico obligatorio antes de reparar ----
    const tecnico = contexto.id_tecnico ?? this.obtener('id_tecnico');
    if (estado === ESTADO_ORDEN.EN_REPARACION && !tecnico) {
      throw new ErrorReglaNegocio(
        'No se puede iniciar la reparacion sin un tecnico asignado',
        'RN-02',
      );
    }

    // ---- RN-03: diagnostico obligatorio para marcar LISTO ----
    const diagnostico = contexto.diagnostico ?? this.obtener('diagnostico');
    if (estado === ESTADO_ORDEN.LISTO && !String(diagnostico ?? '').trim()) {
      throw new ErrorReglaNegocio(
        'No se puede marcar el equipo como LISTO sin un diagnostico registrado',
        'RN-03',
      );
    }

    this._fijar('estado', estado);
    if (tecnico) this._fijar('id_tecnico', tecnico);
    if (contexto.diagnostico !== undefined) this._fijar('diagnostico', contexto.diagnostico);
    if (contexto.solucion !== undefined) this._fijar('solucion', contexto.solucion);
    if (contexto.observaciones !== undefined) this._fijar('observaciones', contexto.observaciones);

    return this;
  }

  /**
   * calcularCosto() - desglose del costo final (apartado 9 del documento).
   *
   *   COSTO FINAL = DIAGNOSTICO + MANO DE OBRA + REPUESTOS
   *                 + SERVICIOS ADICIONALES - DESCUENTOS
   *
   * Es una lectura: el valor que manda es el que dejo el trigger.
   * @param {number} costoRepuestos Suma de los detalles de tipo REPUESTO.
   * @returns {{diagnostico:number, manoObra:number, repuestos:number,
   *            adicionales:number, descuento:number, total:number}}
   */
  calcularCosto(costoRepuestos = 0) {
    const diagnostico = this.obtener('costo_diagnostico');
    const manoObra = this.obtener('costo_mano_obra');
    const adicionales = this.obtener('costo_adicional');
    const descuento = this.obtener('descuento');
    const repuestos = Number(costoRepuestos) || 0;

    return {
      diagnostico,
      manoObra,
      repuestos,
      adicionales,
      descuento,
      total: Math.max(diagnostico + manoObra + repuestos + adicionales - descuento, 0),
    };
  }

  /**
   * aplicarDescuento() - registra un descuento autorizado (RN-05).
   * @param {number} valor
   */
  aplicarDescuento(valor) {
    if (valor < 0) {
      throw new ErrorReglaNegocio('El descuento no puede ser negativo', 'RN-05');
    }
    this.asignar('descuento', valor);
    return this;
  }

  /** Registra el diagnostico tecnico (operacion asignada al Tecnico). */
  registrarDiagnostico(texto) {
    if (!String(texto ?? '').trim()) {
      throw new ErrorReglaNegocio('El diagnostico no puede estar vacio', 'validacion');
    }
    this.asignar('diagnostico', texto);
    return this;
  }

  /** Indica si la orden sigue abierta. */
  get estaAbierta() {
    return this.obtener('estado') !== ESTADO_ORDEN.ENTREGADO
        && this.obtener('estado') !== ESTADO_ORDEN.CANCELADO;
  }

  /** Indica si existe saldo pendiente de cobro. */
  get tieneSaldo() {
    return this.obtener('saldo') > 0;
  }

  /**
   * Horas transcurridas desde la recepcion. Alimenta el indicador
   * "tiempo de reparacion" del apartado 13 del documento.
   * @returns {number|null}
   */
  get horasAtencion() {
    const inicio = this.obtener('fecha_recepcion');
    if (!inicio) return null;
    const fin = this.obtener('fecha_entrega') ?? new Date();
    return Math.round((new Date(fin) - new Date(inicio)) / 36e5);
  }
}
