import { Entidad } from './base/Entidad.js';
import { ErrorReglaNegocio } from './base/ErrorReglaNegocio.js';
import { CATEGORIA_MOVIMIENTO, TIPO_MOVIMIENTO } from './base/vocabulario.js';

/**
 * Proveedor
 *
 * Responsabilidad: "Gestionar suministro". Provee repuestos.
 * Actor externo del sistema: registra el suministro al taller.
 *
 * Multiplicidad: Proveedor 1 -> 0..* Repuesto
 */
export class Proveedor extends Entidad {
  static TABLA = 'proveedor';

  static CAMPOS = {
    id_proveedor:   { tipo: 'entero',  soloLectura: true },
    ruc:            { tipo: 'texto',   requerido: true },
    razon_social:   { tipo: 'texto',   requerido: true },
    contacto_nombre: { tipo: 'texto' },
    telefono:       { tipo: 'texto' },
    email:          { tipo: 'texto' },
    direccion:      { tipo: 'texto' },
    activo:         { tipo: 'booleano', soloLectura: true, porDefecto: 1 },
    created_at:     { tipo: 'datetime', soloLectura: true },
    updated_at:     { tipo: 'datetime', soloLectura: true },
  };

  static ETIQUETAS = {
    ruc: 'RUC',
    razon_social: 'razon social',
    contacto_nombre: 'contacto',
    telefono: 'telefono',
    email: 'correo electronico',
  };

  /**
   * registrar() - alta de proveedor.
   * @param {object} datos
   * @returns {Proveedor}
   */
  static registrar(datos) {
    const proveedor = new Proveedor(datos);
    const ruc = String(proveedor.obtener('ruc')).replace(/\D/g, '');
    if (ruc.length !== 11) {
      throw new ErrorReglaNegocio('El RUC del proveedor debe tener 11 digitos', 'validacion');
    }
    return proveedor;
  }

  /** Nombre comercial para listados. */
  get nombreComercial() {
    return this.obtener('razon_social');
  }
}

/**
 * MovimientoEconomico
 *
 * Responsabilidad: "Registrar ingresos y egresos" (seccion 7 del documento).
 * Se alimenta de pagos y gastos (apartado 9.1).
 *
 * Los movimientos de INGRESO nacen solos: los crea el trigger
 * trg_pago_economia_ai a partir de cada pago. Los EGRESO se registran
 * explicitamente (compras de repuestos, gastos operativos, impuestos).
 */
export class MovimientoEconomico extends Entidad {
  static TABLA = 'movimiento_economico';

  static CAMPOS = {
    id_movimiento: { tipo: 'entero',   soloLectura: true },
    tipo:         { tipo: 'texto',    dominio: Object.values(TIPO_MOVIMIENTO), requerido: true },
    categoria:    { tipo: 'texto',    dominio: Object.values(CATEGORIA_MOVIMIENTO), requerido: true },
    concepto:     { tipo: 'texto',    requerido: true },
    monto:        { tipo: 'decimal',  requerido: true },
    fecha:        { tipo: 'fecha',    requerido: true },
    id_orden:     { tipo: 'entero' },
    id_pago:      { tipo: 'entero',  soloLectura: true },
    id_proveedor: { tipo: 'entero' },
    comprobante:  { tipo: 'texto' },
    created_at:   { tipo: 'datetime', soloLectura: true },
  };

  static ETIQUETAS = {
    tipo: 'tipo de movimiento',
    categoria: 'categoria',
    concepto: 'concepto',
    monto: 'monto',
    fecha: 'fecha',
  };

  /**
   * registrar() - registra un movimiento de ingresos o egresos.
   * @param {object} datos
   * @returns {MovimientoEconomico}
   */
  static registrar(datos) {
    const movimiento = new MovimientoEconomico(datos);

    if (movimiento.obtener('monto') <= 0) {
      throw new ErrorReglaNegocio('El monto del movimiento debe ser mayor que cero', 'validacion');
    }

    // Una compra o un gasto operativo deben senalar a quien se le compro.
    const esCompra = [
      CATEGORIA_MOVIMIENTO.COMPRA_REPUESTO,
      CATEGORIA_MOVIMIENTO.GASTO_OPERATIVO,
    ].includes(movimiento.obtener('categoria'));
    if (movimiento.obtener('tipo') === TIPO_MOVIMIENTO.EGRESO && esCompra
        && !movimiento.obtener('id_proveedor')) {
      throw new ErrorReglaNegocio(
        'Un egreso por compra o gasto debe indicar el proveedor',
        'validacion',
      );
    }
    return movimiento;
  }

  /** Representacion firmada: negativo para egresos. */
  get montoConSigno() {
    const monto = this.obtener('monto');
    return this.obtener('tipo') === TIPO_MOVIMIENTO.EGRESO ? -monto : monto;
  }
}
