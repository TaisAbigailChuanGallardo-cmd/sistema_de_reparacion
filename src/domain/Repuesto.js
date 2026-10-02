import { Entidad } from './base/Entidad.js';
import { ErrorReglaNegocio } from './base/ErrorReglaNegocio.js';

/**
 * Repuesto
 *
 * Responsabilidad: "Gestiona el stock y el uso de repuestos".
 *
 * El stock no se descuenta con una llamada desde la API: loAdjusta el
 * trigger trg_detalle_stock_* cuando un detalle de tipo REPUESTO entra,
 * se modifica o se elimina. Estas operaciones describen la intencion, y la
 * base de datos la aplica (RN-04).
 */
export class Repuesto extends Entidad {
  static TABLA = 'repuesto';

  static CAMPOS = {
    id_repuesto:    { tipo: 'entero',  soloLectura: true },
    id_proveedor:   { tipo: 'entero' },
    codigo:         { tipo: 'texto',   requerido: true },
    nombre:         { tipo: 'texto',   requerido: true },
    descripcion:    { tipo: 'texto' },
    marca:          { tipo: 'texto' },
    stock:          { tipo: 'entero',  soloLectura: true, porDefecto: 0 },
    stock_minimo:   { tipo: 'entero',  porDefecto: 0 },
    costo_unitario: { tipo: 'decimal', requerido: true },
    activo:         { tipo: 'booleano', soloLectura: true, porDefecto: 1 },
    created_at:     { tipo: 'datetime', soloLectura: true },
    updated_at:     { tipo: 'datetime', soloLectura: true },
  };

  static ETIQUETAS = {
    codigo: 'codigo del repuesto',
    nombre: 'nombre del repuesto',
    stock: 'stock',
    stock_minimo: 'stock minimo',
    costo_unitario: 'costo unitario',
  };

  /**
   * registrar() - alta de un repuesto en el catalogo.
   * @param {object} datos
   * @returns {Repuesto}
   */
  static registrar(datos) {
    const repuesto = new Repuesto(datos);

    if (repuesto.obtener('costo_unitario') < 0) {
      throw new ErrorReglaNegocio('El costo unitario no puede ser negativo', 'validacion');
    }
    if (repuesto.obtener('stock_minimo') < 0) {
      throw new ErrorReglaNegocio('El stock minimo no puede ser negativo', 'validacion');
    }
    return repuesto;
  }

  /**
   * actualizarStock() - reponer o corregir existencia. Se usa para el ingreso
   * de mercaderia; el consumo por orden lo hace el trigger.
   * @param {number} cantidad Positiva para reponer, negativa para descartar.
   */
  actualizarStock(cantidad) {
    const delta = Math.trunc(Number(cantidad));
    if (!Number.isFinite(delta) || delta === 0) {
      throw new ErrorReglaNegocio('La cantidad del ajuste de stock debe ser distinta de cero', 'validacion');
    }
    if (this.obtener('stock') + delta < 0) {
      throw new ErrorReglaNegocio(
        'El ajuste dejaria el stock en negativo',
        'RN-04',
      );
    }
    this._fijar('stock', this.obtener('stock') + delta);
    return this;
  }

  /**
   * descontarStock() - solicita el consumo de una cantidad.
   * El trigger vuelve a validarlo dentro de la misma transaccion, de modo que
   * la comprobacion de aqui es una advertencia temprana, no la garantia.
   * @param {number} cantidad
   */
  descontarStock(cantidad) {
    const pedido = Math.trunc(Number(cantidad));
    if (pedido < 1) {
      throw new ErrorReglaNegocio('La cantidad a descontar debe ser al menos 1', 'validacion');
    }
    if (this.obtener('stock') < pedido) {
      throw new ErrorReglaNegocio(
        `Stock insuficiente: quedan ${this.obtener('stock')} unidades y se solicitan ${pedido}`,
        'RN-04',
      );
    }
    this._fijar('stock', this.obtener('stock') - pedido);
    return this;
  }

  /** El stock quedo por debajo del minimo definido por el negocio. */
  get requiereReposicion() {
    return this.obtener('stock') <= this.obtener('stock_minimo');
  }

  /** Valor total del inventario a costo de reposicion. */
  get valorInventario() {
    return Math.round(this.obtener('stock') * this.obtener('costo_unitario') * 100) / 100;
  }
}
