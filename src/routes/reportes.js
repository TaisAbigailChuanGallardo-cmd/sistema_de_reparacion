import { Router } from 'express';
import { asincrono, ErrorPeticion } from '../http/errores.js';
import { ReporteService } from '../services/index.js';
import { repos, indicadores } from '../repositories/index.js';
import { ESTADOS_ORDEN, TRANSICIONES_ORDEN, TIPO_MOVIMIENTO } from '../domain/index.js';

/**
 * Modulo Reportes (apartado 12) e indicadores de gestion (apartado 13).
 * Responde a RF-10.
 */
export const rutasReportes = Router();

/** Rango de fechas por defecto: el mes en curso. */
function rangoPorDefecto(query) {
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    .toISOString().slice(0, 10);

  const desde = query.desde ?? inicioMes;
  const hasta = query.hasta ?? hoy.toISOString().slice(0, 10);

  if (desde > hasta) throw new ErrorPeticion('La fecha "desde" no puede ser posterior a "hasta"');
  return { desde, hasta };
}

/** GET /api/reportes/tablero — indicadores de gestion del apartado 13. */
rutasReportes.get('/tablero', asincrono(async (req, res) => {
  const dias = req.query.dias === undefined ? undefined : Number(req.query.dias);
  res.json({ ok: true, datos: await ReporteService.tablero(dias) });
}));

/** GET /api/reportes/operacion — ordenes atendidas y equipos pendientes. */
rutasReportes.get('/operacion', asincrono(async (req, res) => {
  const { desde, hasta } = rangoPorDefecto(req.query);

  const tablero = await indicadores.tablero();

  const ordenes = await repos.orden.listarConsolidado({ limite: 500 });

  const delPeriodo = ordenes.filter((o) => {
    const fecha = String(o.fecha_recepcion).slice(0, 10);
    return fecha >= desde && fecha <= hasta;
  });

  res.json({
    ok: true,
    datos: {
      periodo: { desde, hasta },
      atendidas: delPeriodo.filter((o) => o.estado === 'ENTREGADO').length,
      pendientes: delPeriodo.filter((o) => o.estado !== 'ENTREGADO' && o.estado !== 'CANCELADO').length,
      por_estado: tablero.ordenes_por_estado,
      detalle: delPeriodo,
    },
  });
}));

/** GET /api/reportes/economico — ingresos, egresos y resultado del periodo. */
rutasReportes.get('/economico', asincrono(async (req, res) => {
  const { desde, hasta } = rangoPorDefecto(req.query);
  const tipo = req.query.tipo ?? '';

  if (tipo && !Object.values(TIPO_MOVIMIENTO).includes(tipo)) {
    throw new ErrorPeticion(`Tipo no valido. Use: ${Object.values(TIPO_MOVIMIENTO).join(', ')}`);
  }

  const [resumen, movimientos, categorias, proveedores] = await Promise.all([
    ReporteService.resumenEconomico(desde, hasta),
    ReporteService.movimientos(desde, hasta, tipo),
    ReporteService.composicionGastos(desde, hasta),
    ReporteService.comprasPorProveedor(desde, hasta),
  ]);

  res.json({
    ok: true,
    datos: { periodo: { desde, hasta }, ...resumen, movimientos, categorias, proveedores },
  });
}));

/** GET /api/reportes/repuestos — consumo de inventario en el periodo. */
rutasReportes.get('/repuestos', asincrono(async (req, res) => {
  const { desde, hasta } = rangoPorDefecto(req.query);
  res.json({
    ok: true,
    datos: {
      periodo: { desde, hasta },
      consumo: await ReporteService.consumoRepuestos(desde, hasta),
      por_reponer: await repos.repuesto.porReponer(),
    },
  });
}));

/** GET /api/reportes/tecnicos — carga de trabajo por tecnico (RN-07). */
rutasReportes.get('/tecnicos', asincrono(async (_req, res) => {
  res.json({ ok: true, datos: await repos.orden.cargaPorTecnico() });
}));

/** GET /api/reportes/tiempos — tiempo de reparacion (entrega - recepcion). */
rutasReportes.get('/tiempos', asincrono(async (req, res) => {
  const { desde, hasta } = rangoPorDefecto(req.query);
  const ordenes = await ReporteService.tiempoReparacion(desde, hasta);
  const horas = ordenes.map((o) => Number(o.horas_atencion)).filter((h) => Number.isFinite(h));

  res.json({
    ok: true,
    datos: {
      periodo: { desde, hasta },
      promedio_horas: horas.length
        ? Math.round((horas.reduce((a, b) => a + b, 0) / horas.length) * 10) / 10
        : 0,
      ordenes,
    },
  });
}));

/** GET /api/reportes/pagos — ingresos registrados en el periodo. */
rutasReportes.get('/pagos', asincrono(async (req, res) => {
  const { desde, hasta } = rangoPorDefecto(req.query);
  const pagos = await repos.pago.listarPorPeriodo(`${desde} 00:00:00`, `${hasta} 23:59:59`);

  const porMetodo = pagos.reduce((acumulado, pago) => {
    acumulado[pago.metodo] = (acumulado[pago.metodo] ?? 0) + Number(pago.monto);
    return acumulado;
  }, {});

  res.json({
    ok: true,
    datos: {
      periodo: { desde, hasta },
      total: pagos.reduce((total, p) => total + Number(p.monto), 0),
      por_metodo: porMetodo,
      pagos,
    },
  });
}));

/**
 * GET /api/reportes/estados
 * Diagrama de estados del documento, para que el frontend pueda dibujar la
 * maquina sin duplicar las transiciones.
 */
rutasReportes.get('/estados', (_req, res) => {
  res.json({
    ok: true,
    datos: {
      estados: ESTADOS_ORDEN,
      transiciones: TRANSICIONES_ORDEN,
    },
  });
});
