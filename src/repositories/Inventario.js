import { consultar, ejecutar } from '../db/pool.js';
import { RepositorioBase } from './RepositorioBase.js';
import { ComprobantePago, Mensaje, MovimientoEconomico, Pago, Repuesto, Tecnico } from '../domain/index.js';

export class RepositorioTecnico extends RepositorioBase {
  static entidad = Tecnico;

  /**
   * Tecnicos con su carga de trabajo actual, para que el tecnico que asigna
   * una orden vea cuanto tiene de cargado antes de elegir (RN-07).
   * El limite se lee de la misma tabla `parametro` que usa el trigger, de
   * modo que la pantalla y la base de datos nunca discrepen.
   */
  async listarConCarga() {
    return consultar(
      `SELECT t.id_tecnico, t.codigo, t.nombre, t.especialidad, t.telefono,
              t.email, t.activo,
              COALESCE(CAST(p.valor AS SIGNED), 5) AS maximo_permitido,
              COUNT(o.id_orden) AS ordenes_asignadas,
              SUM(CASE WHEN o.estado IN ('RECIBIDO','EN_DIAGNOSTICO','PRESUPUESTADO','EN_REPARACION','LISTO')
                       THEN 1 ELSE 0 END) AS ordenes_activas,
              (SELECT COUNT(*) FROM \`orden_servicio\`
                WHERE \`id_tecnico\` = t.id_tecnico AND \`estado\` = 'LISTO') AS ordenes_listas
         FROM \`tecnico\` t
         LEFT JOIN \`v_orden_consolidada\` o ON o.id_tecnico = t.id_tecnico
         LEFT JOIN \`parametro\` p ON p.nombre = 'max_ordenes_por_tecnico'
        GROUP BY t.id_tecnico, t.codigo, t.nombre, t.especialidad, t.telefono, t.email, t.activo
        ORDER BY ordenes_activas DESC, t.nombre ASC`,
    );
  }
}

export class RepositorioRepuesto extends RepositorioBase {
  static entidad = Repuesto;

  /** Repuestos que ya agotaron o cruzaron su stock minimo. */
  async porReponer() {
    return consultar(
      `SELECT r.*, p.razon_social AS proveedor
         FROM \`repuesto\` r
         LEFT JOIN \`proveedor\` p ON p.id_proveedor = r.id_proveedor
        WHERE r.stock <= r.stock_minimo
        ORDER BY (r.stock - r.stock_minimo) ASC`,
    );
  }

  /** Busqueda por codigo, nombre o marca. */
  async buscar(texto, limite = 20) {
    const patron = `%${String(texto).trim()}%`;
    return consultar(
      `SELECT * FROM \`repuesto\`
        WHERE \`codigo\` LIKE ? OR \`nombre\` LIKE ? OR \`marca\` LIKE ?
        ORDER BY \`nombre\` ASC LIMIT ?`,
      [patron, patron, patron, Math.min(Number(limite) || 20, 100)],
    );
  }

  /** Consumo por repuesto, para el reporte de gastos en repuestos. */
  async consumoPorPeriodo(desde, hasta) {
    return consultar(
      `SELECT d.id_repuesto, r.codigo, r.nombre,
              SUM(d.cantidad) AS unidades,
              SUM(d.subtotal) AS total
         FROM \`detalle_servicio\` d
         JOIN \`repuesto\` r ON r.id_repuesto = d.id_repuesto
        WHERE d.concepto = 'REPUESTO' AND d.created_at BETWEEN ? AND ?
        GROUP BY d.id_repuesto, r.codigo, r.nombre
        ORDER BY total DESC`,
      [desde, hasta],
    );
  }
}

export class RepositorioPago extends RepositorioBase {
  static entidad = Pago;

  /** Pagos de un periodo, con la orden a la que pertenecen. */
  async listarPorPeriodo(desde, hasta) {
    return consultar(
      `SELECT p.*, o.numero AS orden_numero, c.nombre AS cliente, c.id_cliente
         FROM \`pago\` p
         JOIN \`orden_servicio\` o ON o.id_orden = p.id_orden
         JOIN \`cliente\` c ON c.id_cliente = o.id_cliente
        WHERE p.fecha BETWEEN ? AND ? AND p.estado = 'REGISTRADO'
        ORDER BY p.fecha DESC`,
      [desde, hasta],
    );
  }
}

export class RepositorioComprobante extends RepositorioBase {
  static entidad = ComprobantePago;
}

export class RepositorioMovimiento extends RepositorioBase {
  static entidad = MovimientoEconomico;

  /**
   * Resultado economico de un periodo: ingresos, egresos y su diferencia
   * (indicador "resultado del periodo", apartado 9.1).
   * @param {string} desde
   * @param {string} hasta
   */
  async resumenPorPeriodo(desde, hasta) {
    const [filas] = await consultar(
      `SELECT tipo,
              COUNT(*) AS movimientos,
              COALESCE(SUM(monto), 0) AS total
         FROM \`movimiento_economico\`
        WHERE fecha BETWEEN ? AND ?
        GROUP BY tipo`,
      [desde, hasta],
    );

    const ingresos = filas.find((f) => f.tipo === 'INGRESO')?.total ?? 0;
    const egresos = filas.find((f) => f.tipo === 'EGRESO')?.total ?? 0;

    return {
      ingresos,
      egresos,
      resultado: Math.round((ingresos - egresos) * 100) / 100,
      movimientos: filas,
    };
  }

  /** Movimientos de un periodo con su detalle, para el reporte. */
  async listarPorPeriodo(desde, hasta, tipo = '') {
    const condiciones = ['fecha BETWEEN ? AND ?'];
    const parametros = [desde, hasta];

    if (tipo) {
      condiciones.push('tipo = ?');
      parametros.push(tipo);
    }
    parametros.push(Math.min(500, 1000));

    return consultar(
      `SELECT m.*, o.numero AS orden_numero, pr.razon_social AS proveedor
         FROM \`movimiento_economico\` m
         LEFT JOIN \`orden_servicio\` o ON o.id_orden = m.id_orden
         LEFT JOIN \`proveedor\` pr ON pr.id_proveedor = m.id_proveedor
        WHERE ${condiciones.join(' AND ')}
        ORDER BY m.fecha DESC, m.id_movimiento DESC
        LIMIT ?`,
      parametros,
    );
  }

  /** Totales por categoria, para el grafico de composicion de gastos. */
  async porCategoria(desde, hasta) {
    return consultar(
      `SELECT tipo, categoria, COALESCE(SUM(monto), 0) AS total, COUNT(*) AS movimientos
         FROM \`movimiento_economico\`
        WHERE fecha BETWEEN ? AND ?
        GROUP BY tipo, categoria
        ORDER BY total DESC`,
      [desde, hasta],
    );
  }
}

export class RepositorioMensaje extends RepositorioBase {
  static entidad = Mensaje;

  /** Bandeja de mensajes, con filtro por cliente o por leidos. */
  async listarRecientes({ idCliente = null, soloNoLeidos = false, limite = 30 } = {}) {
    const condiciones = [];
    const parametros = [];

    if (idCliente) {
      condiciones.push('(id_cliente = ? OR id_cliente IS NULL)');
      parametros.push(idCliente);
    }
    if (soloNoLeidos) condiciones.push('leido = 0');

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    parametros.push(Math.min(Number(limite) || 30, 200));

    return consultar(
      `SELECT * FROM \`mensaje\` ${where} ORDER BY fecha_envio DESC LIMIT ?`,
      parametros,
    );
  }

  /** Marca como leidos los mensajes de un cliente. */
  async marcarLeidos(idCliente) {
    const resultado = await ejecutar(
      'UPDATE `mensaje` SET `leido` = 1 WHERE `id_cliente` = ? AND `leido` = 0',
      [idCliente],
    );
    return resultado.affectedRows;
  }
}
