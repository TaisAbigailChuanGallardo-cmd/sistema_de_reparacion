import { consultar } from '../db/pool.js';
import { RepositorioBase } from './RepositorioBase.js';
import { Cliente, Equipo } from '../domain/index.js';

export class RepositorioCliente extends RepositorioBase {
  static entidad = Cliente;

  /**
   * Busqueda por documento, correo o nombre. Es la busqueda que usa el
   * modulo de recepcion para no crear clientes duplicados.
   * @param {string} texto
   * @param {number} limite
   */
  async buscar(texto, limite = 20) {
    const patron = `%${String(texto).trim()}%`;
    if (!patron || patron === '%%') return [];

    const filas = await consultar(
      `SELECT * FROM \`cliente\`
        WHERE \`numero_documento\` LIKE ?
           OR \`nombre\` LIKE ?
           OR (\`email\` IS NOT NULL AND \`email\` LIKE ?)
           OR \`telefono\` LIKE ?
        ORDER BY \`nombre\` ASC
        LIMIT ?`,
      [patron, patron, patron, patron, Math.min(Number(limite) || 20, 100)],
    );
    return filas.map((fila) => new Cliente(fila));
  }

  /**
   * consultarHistorial() - historial de atencion de un cliente (RF-09).
   * Devuelve sus ordenes con el equipo, el tecnico y el desglose economico,
   * para que el modulo de clientes muestre de un vistazo todo su historial.
   * @param {number} idCliente
   */
  async consultarHistorial(idCliente) {
    return consultar(
      `SELECT v.*,
              h.estado_nuevo, h.estado_anterior, h.fecha AS fecha_cambio
         FROM \`v_orden_consolidada\` v
         LEFT JOIN \`orden_estado_historial\` h
                ON h.id_orden = v.id_orden
        WHERE v.id_cliente = ?
        ORDER BY v.fecha_recepcion DESC, h.fecha ASC`,
      [idCliente],
    );
  }
}

export class RepositorioEquipo extends RepositorioBase {
  static entidad = Equipo;

  /** Equipos de un cliente, del mas reciente al mas antiguo. */
  async porCliente(idCliente) {
    const filas = await consultar(
      'SELECT * FROM `equipo` WHERE `id_cliente` = ? ORDER BY `created_at` DESC',
      [idCliente],
    );
    return filas.map((fila) => new Equipo(fila));
  }

  /** Busqueda por serie o por marca/modelo. */
  async buscar(texto, limite = 20) {
    const patron = `%${String(texto).trim()}%`;
    const filas = await consultar(
      `SELECT * FROM \`equipo\`
        WHERE \`numero_serie\` LIKE ?
           OR \`marca\` LIKE ?
           OR \`modelo\` LIKE ?
        ORDER BY \`created_at\` DESC
        LIMIT ?`,
      [patron, patron, patron, Math.min(Number(limite) || 20, 100)],
    );
    return filas.map((fila) => new Equipo(fila));
  }

  /**
   * Confirma que el equipo pertenezca al cliente indicado. Es la comprobacion
   * de dominio que el trigger trg_orden_valida_* vuelve a hacer en la base.
   * @param {number} idEquipo
   * @param {number} idCliente
   */
  async perteneceACliente(idEquipo, idCliente) {
    const filas = await consultar(
      'SELECT 1 AS ok FROM `equipo` WHERE `id_equipo` = ? AND `id_cliente` = ? LIMIT 1',
      [idEquipo, idCliente],
    );
    return filas.length > 0;
  }
}
