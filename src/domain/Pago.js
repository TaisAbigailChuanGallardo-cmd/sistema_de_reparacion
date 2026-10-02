import { Entidad } from './base/Entidad.js';
import { ErrorReglaNegocio } from './base/ErrorReglaNegocio.js';
import { METODO_PAGO, TIPO_COMPROBANTE } from './base/vocabulario.js';

/**
 * Pago
 *
 * Responsabilidad: "Registra los pagos y genera comprobantes" (seccion 3).
 * Pertenece a una orden.
 *
 * RN-06: todo pago registra monto, fecha y metodo. El trigger
 * trg_pago_valida_bi valida ademas que el monto no exceda el saldo de la
 * orden, y trg_pago_economia_ai proyecta el pago como INGRESO en el
 * registro economico.
 *
 * Multiplicidad: OrdenServicio 1 -> 0..* Pago
 */
export class Pago extends Entidad {
  static TABLA = 'pago';

  static CAMPOS = {
    id_pago:       { tipo: 'entero',    soloLectura: true },
    id_orden:      { tipo: 'entero',    requerido: true },
    id_usuario:    { tipo: 'entero' },
    monto:         { tipo: 'decimal',   requerido: true },
    fecha:         { tipo: 'datetime',  requerido: true },
    metodo:        { tipo: 'texto',     dominio: Object.values(METODO_PAGO), requerido: true },
    referencia:    { tipo: 'texto' },
    estado:        { tipo: 'texto',     soloLectura: true, porDefecto: 'REGISTRADO' },
    observaciones: { tipo: 'texto' },
    created_at:    { tipo: 'datetime',  soloLectura: true },
  };

  static ETIQUETAS = {
    id_orden: 'orden de servicio',
    monto: 'monto',
    fecha: 'fecha del pago',
    metodo: 'metodo de pago',
    referencia: 'referencia',
  };

  /**
   * registrarPago() - valida y crea el pago (RN-06).
   * @param {object} datos
   * @returns {Pago}
   */
  static registrarPago(datos) {
    const pago = new Pago({
      fecha: new Date().toISOString().slice(0, 19).replace('T', ' '),
      ...datos,
    });

    // ---- RN-06: monto, fecha y metodo obligatorios y coherentes ----
    if (pago.obtener('monto') === null || pago.obtener('monto') <= 0) {
      throw new ErrorReglaNegocio('El pago debe registrar un monto mayor que cero', 'RN-06');
    }
    if (!pago.obtener('fecha')) {
      throw new ErrorReglaNegocio('El pago debe registrar la fecha', 'RN-06');
    }
    if (!pago.obtener('metodo')) {
      throw new ErrorReglaNegocio('El pago debe registrar el metodo de pago', 'RN-06');
    }
    if (Number.isNaN(new Date(pago.obtener('fecha')).getTime())) {
      throw new ErrorReglaNegocio('La fecha del pago no es valida', 'validacion');
    }
    return pago;
  }

  /**
   * validarMonto() - comprueba el pago contra el saldo de la orden.
   * @param {number} saldo Pendiente al momento del registro.
   */
  validarMonto(saldo) {
    if (this.obtener('monto') > Number(saldo)) {
      throw new ErrorReglaNegocio(
        `El monto del pago (${this.obtener('monto')}) excede el saldo pendiente (${saldo})`,
        'RN-06',
      );
    }
    return true;
  }
}

/**
 * ComprobantePago
 *
 * Responsabilidad: "Emite comprobantes de pago (boleta/factura)".
 * Multiplicidad: Pago 1 -> 0..1 ComprobantePago
 *
 * El numero y el desglose de subtotal/impuesto los calcula el trigger
 * trg_comprobante_numero_bi a partir del total y del tipo emitido.
 */
export class ComprobantePago extends Entidad {
  static TABLA = 'comprobante_pago';

  /** Tasa de impuesto aplicada al desglose (IGV, Peru). */
  static TASA_IMPUESTO = 0.18;

  static CAMPOS = {
    id_comprobante: { tipo: 'entero',  soloLectura: true },
    id_pago:        { tipo: 'entero',  requerido: true },
    tipo:           { tipo: 'texto',   dominio: Object.values(TIPO_COMPROBANTE), porDefecto: TIPO_COMPROBANTE.BOLETA },
    numero:         { tipo: 'texto',   soloLectura: true },
    fecha_emision:  { tipo: 'datetime', soloLectura: true },
    subtotal:       { tipo: 'decimal', soloLectura: true, porDefecto: 0 },
    impuesto:       { tipo: 'decimal', soloLectura: true, porDefecto: 0 },
    total:          { tipo: 'decimal', requerido: true },
    estado:         { tipo: 'texto',   soloLectura: true, porDefecto: 'EMITIDO' },
  };

  static ETIQUETAS = {
    id_pago: 'pago',
    tipo: 'tipo de comprobante',
    total: 'total',
  };

  /**
   * emitir() - genera el comprobante de un pago.
   * @param {object} datos
   * @returns {ComprobantePago}
   */
  static emitir(datos) {
    const comprobante = new ComprobantePago(datos);
    if (comprobante.obtener('total') <= 0) {
      throw new ErrorReglaNegocio('El total del comprobante debe ser mayor que cero', 'validacion');
    }
    return comprobante;
  }

  /** Desglose del total en base imponible e impuesto. */
  get desglose() {
    const total = this.obtener('total');
    const base = Math.round((total / (1 + this.constructor.TASA_IMPUESTO)) * 100) / 100;
    return { base, impuesto: Math.round((total - base) * 100) / 100, total };
  }
}
