import { Router } from 'express';
import { asincrono, ErrorPeticion } from '../http/errores.js';
import { ClienteService, EquipoService } from '../services/index.js';

/**
 * Modulo Clientes y Equipos (apartado 12 del documento).
 * Responde a RF-01, RF-02 y RF-09.
 */
export const rutasClientes = Router();
export const rutasEquipos = Router();

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

/** GET /api/clientes?busqueda=&limite=&pagina= */
rutasClientes.get('/', asincrono(async (req, res) => {
  const { busqueda, limite = 50, pagina = 1 } = req.query;

  const registros = busqueda
    ? await ClienteService.buscar(busqueda, limite)
    : await ClienteService.listar({ limite, desplazamiento: (pagina - 1) * limite });

  res.json({ ok: true, datos: registros.map((c) => c.toJSON()) });
}));

/** GET /api/clientes/:id  con su historial de ordenes y equipos (RF-09). */
rutasClientes.get('/:id', asincrono(async (req, res) => {
  const cliente = await ClienteService.obtener(req.params.id);
  const historial = await ClienteService.historial(req.params.id);
  res.json({ ok: true, datos: { cliente: cliente.toJSON(), ...historial } });
}));

/** POST /api/clientes  (RF-01) */
rutasClientes.post('/', asincrono(async (req, res) => {
  if (!req.body?.numero_documento || !req.body?.nombre || !req.body?.telefono) {
    throw new ErrorPeticion('numero_documento, nombre y telefono son obligatorios');
  }
  const cliente = await ClienteService.registrar(req.body);
  res.status(201).json({ ok: true, datos: cliente.toJSON() });
}));

/** PUT /api/clientes/:id */
rutasClientes.put('/:id', asincrono(async (req, res) => {
  const cliente = await ClienteService.actualizar(req.params.id, req.body ?? {});
  res.json({ ok: true, datos: cliente.toJSON() });
}));

// ---------------------------------------------------------------------------
// Equipos
// ---------------------------------------------------------------------------

/** GET /api/equipos?busqueda=&cliente= */
rutasEquipos.get('/', asincrono(async (req, res) => {
  const { busqueda, cliente, limite = 50 } = req.query;

  if (busqueda) {
    res.json({ ok: true, datos: await EquipoService.buscar(busqueda, limite) });
    return;
  }
  if (cliente) {
    res.json({ ok: true, datos: await repos.equipo.porCliente(cliente) });
    return;
  }
  res.json({ ok: true, datos: await EquipoService.listar({ limite }) });
}));

/** GET /api/equipos/:id  incluye las ordenes en las que estuvo. */
rutasEquipos.get('/:id', asincrono(async (req, res) => {
  const equipo = await EquipoService.obtener(req.params.id);
  const ordenes = await consultar(
    `SELECT v.* FROM \`v_orden_consolidada\` v
      WHERE v.id_equipo = ? ORDER BY v.fecha_recepcion DESC`,
    [req.params.id],
  );
  res.json({ ok: true, datos: { equipo: equipo.toJSON(), ordenes } });
}));

/** POST /api/equipos  (RF-02) */
rutasEquipos.post('/', asincrono(async (req, res) => {
  const { id_cliente, tipo, marca, modelo, numero_serie } = req.body ?? {};

  for (const [campo, valor] of Object.entries({
    id_cliente, tipo, marca, modelo, numero_serie,
  })) {
    if (valor === undefined || valor === null || valor === '') {
      throw new ErrorPeticion(`El campo "${campo}" es obligatorio`);
    }
  }
  if (!Object.values(TIPO_EQUIPO).includes(tipo)) {
    throw new ErrorPeticion(`Tipo de equipo no valido. Use: ${Object.values(TIPO_EQUIPO).join(', ')}`);
  }

  const equipo = await EquipoService.registrar(req.body);
  res.status(201).json({ ok: true, datos: equipo.toJSON() });
}));

/** PUT /api/equipos/:id */
rutasEquipos.put('/:id', asincrono(async (req, res) => {
  const equipo = await EquipoService.actualizar(req.params.id, req.body ?? {});
  res.json({ ok: true, datos: equipo.toJSON() });
}));

