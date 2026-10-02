import { consultar, ejecutar } from '../db/pool.js';
import { RepositorioBase } from './RepositorioBase.js';
import { DetalleServicio, OrdenServicio } from '../domain/index.js';
import { ESTADOS_ACTIVOS_ORDEN } from '../domain/index.js';

export class RepositorioOrden extends RepositorioBase {
  static entidad = OrdenServicio;

  /**
   * Listado enriquecido: une cliente, equipo y tecnico, que es lo que la
   * tabla de ordenes necesita mostrar. Los estados y la busqueda libre se
   * filtran aqui, no en el cliente, para que la vista no descargue filas
   * que luego se descartan.
   *
   * @param {object} opciones
   * @param {string} opciones.busqueda
   * @param {string} opciones.estado
   * @param {boolean} opciones.pendientes
   */
  async listarConsolidado({ busqueda = '', estado = '', pendientes = false, limite = 50, desplazamiento = 0 } = {}) {
    const condiciones = [];
    const parametros = [];

    if (estado) {
      condiciones.push('v.estado = ?');
      parametros.push(estado);
    }
    if (pendientes) {
      condiciones.push(`v.estado IN (${ESTADOS_ACTIVOS_ORDEN.map(() => '?').join(', ')})`);
      parametros.push(...ESTADOS_ACTIVOS_ORDEN);
    }
    if (busqueda && String(busqueda).trim()) {
      const patron = `%${String(busqueda).trim()}%`;
      condiciones.push(`(v.numero LIKE ? OR v.cliente LIKE ? OR v.equipo LIKE ? OR v.tecnico LIKE ?)`);
      parametros.push(patron, patron, patron, patron);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    parametros.push(Math.min(Number(limite) || 50, 500), Math.max(Number(desplazamiento) || 0, 0));

    return consultar(
      `SELECT v.* FROM \`v_orden_consolidada\` v
        ${where}
        ORDER BY v.fecha_recepcion DESC
        LIMIT ? OFFSET ?`,
      parametros,
    );
  }

  /** Detalle de una orden con cliente, equipo, tecnico y desglose de costo. */
  async obtenerDetalle(idOrden) {
    const orden = await consultar('SELECT * FROM `v_orden_consolidada` WHERE id_orden = ?', [idOrden]);
    if (!orden.length) return null;

    const [repuestos, manoObra, adicionales, diagnostico] = await Promise.all([
      consultar(
        `SELECT d.*, r.codigo AS repuesto_codigo, r.nombre AS repuesto_nombre
           FROM \`detalle_servicio\` d
           LEFT JOIN \`repuesto\` r ON r.id_repuesto = d.id_repuesto
          WHERE d.id_orden = ? AND d.concepto = 'REPUESTO'`,
        [idOrden],
      ),
      consultar(
        `SELECT d.* FROM \`detalle_servicio\` d
          WHERE d.id_orden = ? AND d.concepto = 'MANO_DE_OBRA'`,
        [idOrden],
      ),
      consultar(
        `SELECT d.* FROM \`detalle_servicio\` d
          WHERE d.id_orden = ? AND d.concepto IN ('SERVICIO_ADICIONAL','DIAGNOSTICO')`,
        [idOrden],
      ),
    ]);

    const costoRepuestos = repuestos.reduce(
      (total, linea) => total + Number(linea.subtotal), 0,
    );

    return {
      ...orden[0],
      detalles: { repuestos, manoObra, adicionales, diagnostico },
      desglose: {
        diagnostico: Number(orden[0].costo_diagnostico),
        manoObra: Number(orden[0].costo_mano_obra),
        repuestos: Math.round(costoRepuestos * 100) / 100,
        adicionales: Number(orden[0].costo_adicional),
        descuento: Number(orden[0].descuento),
        total: Number(orden[0].costo_final),
      },
    };
  }

  /** Pagos registrados de una orden, con su comprobante. */
  async listarPagos(idOrden) {
    return consultar(
      `SELECT p.*, c.numero AS comprobante_numero, c.tipo AS comprobante_tipo
         FROM \`pago\` p
         LEFT JOIN \`comprobante_pago\` c ON c.id_pago = p.id_pago
        WHERE p.id_orden = ?
        ORDER BY p.fecha DESC`,
      [idOrden],
    );
  }

  /** Transiciones registradas: alimenta la vista de seguimiento. */
  async listarHistorialEstados(idOrden) {
    return consultar(
      `SELECT h.*, u.nombre AS usuario
         FROM \`orden_estado_historial\` h
         LEFT JOIN \`usuario\` u ON u.id_usuario = h.id_usuario
        WHERE h.id_orden = ?
        ORDER BY h.fecha ASC, h.id_historial ASC`,
      [idOrden],
    );
  }

  /**
   * Cambia el estado de la orden.
   *
   * El estado se escribe directamente, sin pasar por aParametros(), porque
   * en OrdenServicio el atributo es de solo lectura: la unica forma de
   * avanzar es esta operacion, que ademas es la que activa los triggers
   * RN-02, RN-03 y RN-07.
   *
   * @param {number} idOrden
   * @param {object} cambios  estado, id_tecnico, diagnostico, solucion, observaciones
   */
  async cambiarEstado(idOrden, cambios) {
    const permitidos = ['estado', 'id_tecnico', 'diagnostico', 'solucion', 'observaciones'];
    const columnas = permitidos.filter((c) => cambios[c] !== undefined);

    if (!columnas.length) return this.buscarPorId(idOrden);

    const asignaciones = columnas.map((c) => `\`${c}\` = ?`).join(', ');
    await ejecutar(
      `UPDATE \`orden_servicio\` SET ${asignaciones} WHERE \`id_orden\` = ?`,
      [...columnas.map((c) => cambios[c]), idOrden],
    );
    return this.buscarPorId(idOrden);
  }

  /**
   * Actividad por tecnico:cuantas ordenes tiene asignadas y cuantas siguen
   * abiertas (indicador "servicios por tecnico", apartado 13).
   */
  async cargaPorTecnico() {
    return consultar(
      `SELECT t.id_tecnico, t.nombre, t.especialidad, t.activo,
              COUNT(o.id_orden) AS ordenes_asignadas,
              SUM(CASE WHEN o.estado IN (${ESTADOS_ACTIVOS_ORDEN.map(() => '?').join(', ')})
                       THEN 1 ELSE 0 END) AS ordenes_activas,
              COALESCE(SUM(CASE WHEN o.estado = 'ENTREGADO' THEN o.horas_atencion END), 0) AS horas_totales
         FROM \`tecnico\` t
         LEFT JOIN \`v_orden_consolidada\` o ON o.id_tecnico = t.id_tecnico
        GROUP BY t.id_tecnico, t.nombre, t.especialidad, t.activo
        ORDER BY ordenes_activas DESC`,
      ESTADOS_ACTIVOS_ORDEN,
    );
  }
}

export class RepositorioDetalle extends RepositorioBase {
  static entidad = DetalleServicio;

  /** Detalles de una orden, agrupados por concepto. */
  async porOrden(idOrden) {
    return consultar(
      `SELECT d.*, r.codigo AS repuesto_codigo, r.nombre AS repuesto_nombre, r.stock AS repuesto_stock
         FROM \`detalle_servicio\` d
         LEFT JOIN \`repuesto\` r ON r.id_repuesto = d.id_repuesto
        WHERE d.id_orden = ?
        ORDER BY d.concepto, d.id_detalle`,
      [idOrden],
    );
  }
}
