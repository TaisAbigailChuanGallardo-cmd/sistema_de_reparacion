import { Router } from 'express';
import { asincrono, ErrorPeticion } from '../http/errores.js';
import { OrdenServicioService, PagoService } from '../services/index.js';
import { ESTADO_ORDEN, CONCEPTO_SERVICIO, METODO_PAGO, PRIORIDAD_ORDEN } from '../domain/index.js';

/**
 * Modulo Ordenes de Servicio (apartado 12 del documento).
 * Responde a RF-03, RF-04, RF-05, RF-06, RF-07 y RF-08.
 */
export const rutasOrdenes = Router();

/** GET /api/ordenes?busqueda=&estado=&pendientes= */
rutasOrdenes.get('/', asincrono(async (req, res) => {
  const { busqueda = '', estado = '', pendientes = false, limite = 50, pagina = 1 } = req.query;

  const datos = await OrdenServicioService.listar({
    busqueda,
    estado,
    pendientes: pendientes === 'true' || pendientes === true,
    limite,
    desplazamiento: (pagina - 1) * limite,
  });

  res.json({ ok: true, datos });
}));

/**
 * GET /api/ordenes/:id
 * Detalle completo: encabezado, desglose economico, conceptos, pagos,
 * comprobantes e historial de estados.
 */
rutasOrdenes.get('/:id', asincrono(async (req, res) => {
  res.json({ ok: true, datos: await OrdenServicioService.detalle(req.params.id) });
}));

/** POST /api/ordenes  (RF-03) — el numero unico lo genera la base. */
rutasOrdenes.post('/', asincrono(async (req, res) => {
  const { id_cliente, id_equipo } = req.body ?? {};

  if (!id_cliente || !id_equipo) {
    throw new ErrorPeticion('id_cliente e id_equipo son obligatorios (RN-01)');
  }
  if (req.body.prioridad && !Object.values(PRIORIDAD_ORDEN).includes(req.body.prioridad)) {
    throw new ErrorPeticion(`Prioridad no valida. Use: ${Object.values(PRIORIDAD_ORDEN).join(', ')}`);
  }

  const orden = await OrdenServicioService.registrar({
    ...req.body,
    id_usuario_registro: req.body.id_usuario_registro ?? req.usuario?.id_usuario ?? null,
  });

  res.status(201).json({ ok: true, datos: orden.toJSON() });
}));

/**
 * PATCH /api/ordenes/:id/estado  (RF-05)
 * Recorre el diagrama de estados; aplica RN-02, RN-03 y RN-07.
 */
rutasOrdenes.patch('/:id/estado', asincrono(async (req, res) => {
  const { estado, id_tecnico, diagnostico, solucion, observaciones } = req.body ?? {};

  if (!estado) throw new ErrorPeticion('El campo "estado" es obligatorio');
  if (!Object.values(ESTADO_ORDEN).includes(estado)) {
    throw new ErrorPeticion(`Estado no valido. Use: ${Object.values(ESTADO_ORDEN).join(', ')}`);
  }

  const orden = await OrdenServicioService.cambiarEstado(req.params.id, {
    estado, id_tecnico, diagnostico, solucion, observaciones,
  });

  res.json({ ok: true, datos: orden.toJSON() });
}));

/** PATCH /api/ordenes/:id/tecnico  (RN-02) */
rutasOrdenes.patch('/:id/tecnico', asincrono(async (req, res) => {
  const { id_tecnico } = req.body ?? {};
  if (!id_tecnico) throw new ErrorPeticion('El campo "id_tecnico" es obligatorio');

  const orden = await OrdenServicioService.asignarTecnico(req.params.id, id_tecnico);
  res.json({ ok: true, datos: orden.toJSON() });
}));

/** PUT /api/ordenes/:id/diagnostico  (RF-04) */
rutasOrdenes.put('/:id/diagnostico', asincrono(async (req, res) => {
  const { diagnostico } = req.body ?? {};
  if (!diagnostico) throw new ErrorPeticion('El campo "diagnostico" es obligatorio');

  const orden = await OrdenServicioService.registrarDiagnostico(req.params.id, diagnostico);
  res.json({ ok: true, datos: orden.toJSON() });
}));

/**
 * POST /api/ordenes/:id/conceptos  (RF-06)
 * Agrega un repuesto, mano de obra o servicio adicional.
 * El descuento de stock (RN-04) y el nuevo costo final (RN-05) los aplican
 * los triggers dentro de la misma operacion.
 */
rutasOrdenes.post('/:id/conceptos', asincrono(async (req, res) => {
  const { concepto, descripcion, cantidad = 1, id_repuesto, costo_unitario } = req.body ?? {};

  if (!concepto || !descripcion) {
    throw new ErrorPeticion('Los campos "concepto" y "descripcion" son obligatorios');
  }
  if (!Object.values(CONCEPTO_SERVICIO).includes(concepto)) {
    throw new ErrorPeticion(`Concepto no valido. Use: ${Object.values(CONCEPTO_SERVICIO).join(', ')}`);
  }
  if (concepto === CONCEPTO_SERVICIO.REPUESTO && !id_repuesto) {
    throw new ErrorPeticion('Un concepto de repuesto requiere "id_repuesto" (RN-04)', 422);
  }
  if (Number(cantidad) < 1) throw new ErrorPeticion('La cantidad debe ser al menos 1');

  const detalle = await OrdenServicioService.agregarDetalle(req.params.id, {
    concepto, descripcion, cantidad, id_repuesto, costo_unitario,
  });

  res.status(201).json({ ok: true, datos: detalle.toJSON() });
}));

/** DELETE /api/ordenes/:id/conceptos/:idDetalle — devuelve el repuesto al stock. */
rutasOrdenes.delete('/:id/conceptos/:idDetalle', asincrono(async (req, res) => {
  await OrdenServicioService.quitarDetalle(req.params.id, req.params.idDetalle);
  const orden = await OrdenServicioService.obtener(req.params.id);
  res.json({ ok: true, datos: orden.toJSON() });
}));

/** PATCH /api/ordenes/:id/descuento  (RN-05) */
rutasOrdenes.patch('/:id/descuento', asincrono(async (req, res) => {
  const { descuento } = req.body ?? {};
  if (descuento === undefined) throw new ErrorPeticion('El campo "descuento" es obligatorio');

  const orden = await OrdenServicioService.aplicarDescuento(req.params.id, Number(descuento));
  res.json({ ok: true, datos: orden.toJSON() });
}));

/** POST /api/ordenes/:id/pagos  (RF-08) — emite pago y comprobante a la vez. */
rutasOrdenes.post('/:id/pagos', asincrono(async (req, res) => {
  const { monto, metodo, fecha, referencia, tipo_comprobante, observaciones } = req.body ?? {};

  if (monto === undefined) throw new ErrorPeticion('El campo "monto" es obligatorio (RN-06)');
  if (!metodo) throw new ErrorPeticion('El campo "metodo" es obligatorio (RN-06)');
  if (metodo && !Object.values(METODO_PAGO).includes(metodo)) {
    throw new ErrorPeticion(`Metodo no valido. Use: ${Object.values(METODO_PAGO).join(', ')}`);
  }

  const resultado = await PagoService.registrar(req.params.id, {
    monto: Number(monto),
    metodo,
    fecha,
    referencia,
    tipo_comprobante,
    observaciones,
    id_usuario: req.body.id_usuario ?? req.usuario?.id_usuario ?? null,
  });

  res.status(201).json({
    ok: true,
    datos: {
      pago: resultado.pago.toJSON(),
      comprobante: resultado.comprobante.toJSON(),
      orden: resultado.orden.toJSON(),
    },
  });
}));
