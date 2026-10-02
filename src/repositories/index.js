import { consultar } from '../db/pool.js';
import { RepositorioBase } from './RepositorioBase.js';
import { RepositorioCliente, RepositorioEquipo } from './Cliente.js';
import { RepositorioDetalle, RepositorioOrden } from './OrdenServicio.js';
import {
  RepositorioComprobante,
  RepositorioMensaje,
  RepositorioMovimiento,
  RepositorioPago,
  RepositorioRepuesto,
  RepositorioTecnico,
} from './Inventario.js';
import {
  RepositorioMovimientoEgreso,
  RepositorioPlan,
  RepositorioProveedor,
  RepositorioRol,
  RepositorioSuscripcion,
  RepositorioUsuario,
} from './Seguridad.js';

/**
 * Contenedor de repositorios.
 *
 * Una sola instancia compartida por toda la aplicacion. Se construye de
 * forma perezosa para no abrir conexiones al importar el modulo, lo que
 * permite que los tests del dominio corran sin base de datos.
 */
export const repos = {
  cliente:    new RepositorioCliente(),
  equipo:     new RepositorioEquipo(),
  orden:      new RepositorioOrden(),
  detalle:    new RepositorioDetalle(),
  tecnico:    new RepositorioTecnico(),
  repuesto:   new RepositorioRepuesto(),
  pago:       new RepositorioPago(),
  comprobante: new RepositorioComprobante(),
  movimiento: new RepositorioMovimiento(),
  egreso:     new RepositorioMovimientoEgreso(),
  proveedor:  new RepositorioProveedor(),
  mensaje:    new RepositorioMensaje(),
  usuario:    new RepositorioUsuario(),
  rol:        new RepositorioRol(),
  plan:       new RepositorioPlan(),
  suscripcion: new RepositorioSuscripcion(),
};

export {
  RepositorioBase,
  RepositorioCliente,
  RepositorioEquipo,
  RepositorioOrden,
  RepositorioDetalle,
  RepositorioTecnico,
  RepositorioRepuesto,
  RepositorioPago,
  RepositorioComprobante,
  RepositorioMovimiento,
  RepositorioMovimientoEgreso,
  RepositorioProveedor,
  RepositorioMensaje,
  RepositorioUsuario,
  RepositorioRol,
  RepositorioPlan,
  RepositorioSuscripcion,
};

/**
 * Consultas de los indicadores de gestion del apartado 13 del documento.
 * Se agrupan aqui porque son de solo lectura y no pertenecen a una entidad
 * concreta, sino al tablero de control.
 */
export const indicadores = {
  /**
   * Todo lo que el tablero de control necesita en una sola llamada: los
   * indicadores de la vista, la serie diaria de los ultimos 14 dias, la
   * distribucion por marca, la carga de cada tecnico y las tres bandejas de
   * alertas (garantias, stock y mensajes).
   *
   * La serie se arma en memoria y no en SQL a proposito: en la base un dia sin
   * movimientos no aparece en el GROUP BY, y el grafico necesita un punto por
   * dia para que la linea no mienta los dias sin actividad.
   *
   * @param {number} dias Ventana de la serie diaria.
   */
  async tablero({ dias = 14 } = {}) {
    const [resumen] = await consultar('SELECT * FROM v_indicadores');
    const ventana = Math.min(Math.max(Number(dias) || 14, 7), 60);

    const porEstado = await consultar(
      `SELECT estado, COUNT(*) AS total
         FROM \`orden_servicio\` GROUP BY estado ORDER BY total DESC`,
    );

    const porMarca = await consultar(
      `SELECT e.\`marca\`, COUNT(*) AS total
         FROM \`orden_servicio\` o
         JOIN \`equipo\` e ON e.\`id_equipo\` = o.\`id_equipo\`
        GROUP BY e.\`marca\`
        ORDER BY total DESC, e.\`marca\` ASC`,
    );

    const porTipo = await consultar(
      `SELECT e.\`tipo\`, COUNT(*) AS total
         FROM \`orden_servicio\` o
         JOIN \`equipo\` e ON e.\`id_equipo\` = o.\`id_equipo\`
        GROUP BY e.\`tipo\`
        ORDER BY total DESC`,
    );

    const porTecnico = await consultar(
      `SELECT t.id_tecnico, t.nombre, t.especialidad,
              COUNT(o.id_orden) AS ordenes,
              SUM(CASE WHEN o.estado = 'ENTREGADO' THEN 1 ELSE 0 END) AS entregadas,
              SUM(CASE WHEN o.estado IN ('RECIBIDO','EN_DIAGNOSTICO','PRESUPUESTADO','EN_REPARACION','LISTO')
                       THEN 1 ELSE 0 END) AS activas,
              SUM(CASE WHEN o.estado = 'LISTO' THEN 1 ELSE 0 END) AS listas,
              ROUND(COALESCE(AVG(CASE WHEN o.estado = 'ENTREGADO' THEN o.horas_atencion END), 0), 1) AS horas_promedio
         FROM \`tecnico\` t
         LEFT JOIN \`v_orden_consolidada\` o ON o.id_tecnico = t.id_tecnico
        GROUP BY t.id_tecnico, t.nombre, t.especialidad
        ORDER BY activas DESC, t.nombre ASC`,
    );

    const recientes = await consultar(
      `SELECT id_orden, numero, cliente, equipo, equipo_tipo, tecnico, estado,
              prioridad, costo_final, total_pagado, saldo, fecha_recepcion
         FROM \`v_orden_consolidada\`
        ORDER BY fecha_recepcion DESC, id_orden DESC
        LIMIT 6`,
    );

    const ingresosDiarios = await consultar(
      `SELECT DATE(\`fecha\`) AS dia, COALESCE(SUM(\`monto\`), 0) AS total
         FROM \`movimiento_economico\`
        WHERE \`tipo\` = 'INGRESO' AND \`fecha\` >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY dia`,
      [ventana - 1],
    );

    const recibidasDiarias = await consultar(
      `SELECT DATE(\`fecha_recepcion\`) AS dia, COUNT(*) AS total
         FROM \`orden_servicio\`
        WHERE \`fecha_recepcion\` >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY dia`,
      [ventana - 1],
    );

    const entregadasDiarias = await consultar(
      `SELECT DATE(\`fecha_entrega\`) AS dia, COUNT(*) AS total
         FROM \`orden_servicio\`
        WHERE \`estado\` = 'ENTREGADO' AND \`fecha_entrega\` >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY dia`,
      [ventana - 1],
    );

    const garantias = await consultar(
      `SELECT o.id_orden, o.numero, o.estado, o.garantia_dias, o.fecha_entrega,
              c.nombre AS cliente, CONCAT(e.marca, ' ', e.modelo) AS equipo,
              DATEDIFF(DATE_ADD(o.fecha_entrega, INTERVAL o.garantia_dias DAY), CURDATE()) AS dias_restantes
         FROM \`orden_servicio\` o
         JOIN \`cliente\` c ON c.id_cliente = o.id_cliente
         JOIN \`equipo\`  e ON e.id_equipo  = o.id_equipo
        WHERE o.estado = 'ENTREGADO'
          AND o.garantia_dias > 0
          AND DATE_ADD(o.fecha_entrega, INTERVAL o.garantia_dias DAY)
              BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 15 DAY)
        ORDER BY dias_restantes ASC
        LIMIT 5`,
    );

    const stockBajo = await consultar(
      `SELECT r.id_repuesto, r.codigo, r.nombre, r.stock, r.stock_minimo,
              r.costo_unitario, p.razon_social AS proveedor
         FROM \`repuesto\` r
         LEFT JOIN \`proveedor\` p ON p.id_proveedor = r.id_proveedor
        WHERE r.stock <= r.stock_minimo
        ORDER BY (r.stock - r.stock_minimo) ASC, r.nombre ASC
        LIMIT 5`,
    );

    const mensajes = await consultar(
      `SELECT m.id_mensaje, m.asunto, m.contenido, m.canal, m.leido, m.fecha_envio,
              c.nombre AS cliente, o.numero AS orden_numero
         FROM \`mensaje\` m
         LEFT JOIN \`cliente\` c ON c.id_cliente = m.id_cliente
         LEFT JOIN \`orden_servicio\` o ON o.id_orden = m.id_orden
        WHERE m.leido = 0
        ORDER BY m.fecha_envio DESC
        LIMIT 5`,
    );

    const economico = await consultar(
      `SELECT tipo, COALESCE(SUM(\`monto\`), 0) AS total, COUNT(*) AS movimientos
         FROM \`movimiento_economico\`
        WHERE \`fecha\` >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        GROUP BY tipo`,
    );

    const totalIngresos = Number(economico.find((f) => f.tipo === 'INGRESO')?.total ?? 0);
    const totalEgresos = Number(economico.find((f) => f.tipo === 'EGRESO')?.total ?? 0);

    return {
      ...resumen,
      utilidad_mes: Math.round((totalIngresos - totalEgresos) * 100) / 100,
      margen_mes: totalIngresos > 0
        ? Math.round(((totalIngresos - totalEgresos) / totalIngresos) * 1000) / 10
        : 0,
      ordenes_por_estado: porEstado,
      ordenes_por_marca: porMarca,
      equipos_por_tipo: porTipo,
      carga_por_tecnico: porTecnico,
      ordenes_recientes: recientes,
      serie_diaria: this._serieDiaria(ventana, recibidasDiarias, entregadasDiarias, ingresosDiarios),
      alertas_garantias: garantias,
      alertas_stock: stockBajo,
      alertas_mensajes: mensajes,
    };
  },

  /**
   * Rellena los dias sin movimiento con cero para que la serie tenga siempre
   * un punto por dia, incluido el de hoy.
   * @returns {{dia: string, recibidas: number, entregadas: number, ingresos: number}[]}
   */
  _serieDiaria(ventana, recibidas, entregadas, ingresos) {
    const indice = (filas, campo) => new Map(
      filas.map((fila) => [String(fila.dia).slice(0, 10), Number(fila.total)]),
    );
    const mapaRecibidas = indice(recibidas);
    const mapaEntregadas = indice(entregadas);
    const mapaIngresos = indice(ingresos);

    const serie = [];
    for (let offset = ventana - 1; offset >= 0; offset -= 1) {
      const dia = new Date();
      dia.setDate(dia.getDate() - offset);
      // Se arma la clave con las partes locales y no con toISOString(): en Lima
      // (UTC-5) a partir de las 19:00 el UTC ya es del dia siguiente y la
      // etiqueta no coincidiria con el dia que trae MariaDB, dejando el grafico
      // en cero aunque haya ordenes.
      const clave = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
      serie.push({
        dia: clave,
        recibidas: mapaRecibidas.get(clave) ?? 0,
        entregadas: mapaEntregadas.get(clave) ?? 0,
        ingresos: mapaIngresos.get(clave) ?? 0,
      });
    }
    return serie;
  },

  /** Indicador "tiempo de reparacion" (entrega - recepcion). */
  async tiempoDeReparacion(desde, hasta) {
    return consultar(
      `SELECT o.numero, o.cliente, o.equipo, o.tecnico,
              o.fecha_recepcion, o.fecha_entrega, o.horas_atencion
         FROM \`v_orden_consolidada\` o
        WHERE o.estado = 'ENTREGADO' AND o.fecha_entrega BETWEEN ? AND ?
        ORDER BY o.horas_atencion DESC`,
      [desde, hasta],
    );
  },
};
