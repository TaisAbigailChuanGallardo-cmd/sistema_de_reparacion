import { Router } from 'express';
import { asincrono, ErrorPeticion } from '../http/errores.js';
import { InventarioService } from '../services/index.js';
import { repos } from '../repositories/index.js';
import { ejecutar } from '../db/pool.js';
import { Mensaje, TIPO_MENSAJE, TIPO_SUSCRIPCION } from '../domain/index.js';

/**
 * Modulo de personal, usuarios, planes y comunicacion.
 * Cubre el control de acceso (RNF-02) y el caso de uso "registrar datos de
 * repuestos" del proveedor.
 */
export const rutasEquipo = Router();
export const rutasUsuarios = Router();
export const rutasPlanes = Router();
export const rutasMensajes = Router();

// ---------------------------------------------------------------------------
// Tecnicos
// ---------------------------------------------------------------------------

/** GET /api/tecnicos — incluye la carga de trabajo que aplica la RN-07. */
rutasEquipo.get('/', asincrono(async (req, res) => {
  const { activo } = req.query;
  const datos = await InventarioService.listarTecnicosConCarga();

  res.json({
    ok: true,
    datos: activo === undefined ? datos : datos.filter((t) => Boolean(Number(t.activo)) === (activo === 'true')),
  });
}));

/** POST /api/tecnicos */
rutasEquipo.post('/', asincrono(async (req, res) => {
  const { nombre, especialidad } = req.body ?? {};
  if (!nombre || !especialidad) {
    throw new ErrorPeticion('Los campos "nombre" y "especialidad" son obligatorios');
  }
  const tecnico = await InventarioService.registrarTecnico(req.body);
  res.status(201).json({ ok: true, datos: tecnico.toJSON() });
}));

// ---------------------------------------------------------------------------
// Usuarios y planes
// ---------------------------------------------------------------------------

/** GET /api/usuarios — nunca devuelve el hash de la contrasena. */
rutasUsuarios.get('/', asincrono(async (_req, res) => {
  res.json({ ok: true, datos: await repos.usuario.listarPublicos() });
}));

/** GET /api/usuarios/roles */
rutasUsuarios.get('/roles', asincrono(async (_req, res) => {
  res.json({ ok: true, datos: await repos.rol.listar({ limite: 50 }) });
}));

/** GET /api/usuarios/:id/suscripcion */
rutasUsuarios.get('/:id/suscripcion', asincrono(async (req, res) => {
  const [suscripcion] = await repos.suscripcion.listarDetalladas()
    .then((filas) => filas.filter((s) => s.id_usuario === Number(req.params.id)));

  res.json({ ok: true, datos: suscripcion ?? null });
}));

/** GET /api/planes — planes con sus beneficios. */
rutasPlanes.get('/', asincrono(async (_req, res) => {
  res.json({ ok: true, datos: await repos.plan.listarConBeneficios() });
}));

/** GET /api/planes/suscripciones */
rutasPlanes.get('/suscripciones', asincrono(async (req, res) => {
  const estado = req.query.estado;
  const datos = await repos.suscripcion.listarDetalladas();
  res.json({
    ok: true,
    datos: estado && Object.values(TIPO_SUSCRIPCION).includes(estado)
      ? datos.filter((s) => s.estado === estado)
      : datos,
  });
}));

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

/** GET /api/mensajes?cliente=&noLeidos= */
rutasMensajes.get('/', asincrono(async (req, res) => {
  const { cliente, noLeidos, limite = 30 } = req.query;
  res.json({
    ok: true,
    datos: await repos.mensaje.listarRecientes({
      idCliente: cliente ? Number(cliente) : null,
      soloNoLeidos: noLeidos === 'true',
      limite,
    }),
  });
}));

/** POST /api/mensajes */
rutasMensajes.post('/', asincrono(async (req, res) => {
  const { id_cliente, id_orden, canal, asunto, contenido } = req.body ?? {};

  if (!asunto || !contenido) {
    throw new ErrorPeticion('Los campos "asunto" y "contenido" son obligatorios');
  }
  if (canal && !Object.values(TIPO_MENSAJE).includes(canal)) {
    throw new ErrorPeticion(`Canal no valido. Use: ${Object.values(TIPO_MENSAJE).join(', ')}`);
  }

  const mensaje = Mensaje.enviar({
    id_usuario: req.body.id_usuario ?? req.usuario?.id_usuario,
    id_cliente,
    id_orden,
    canal,
    asunto,
    contenido,
  });

  res.status(201).json({ ok: true, datos: (await repos.mensaje.crear(mensaje)).toJSON() });
}));

/** PATCH /api/mensajes/:id/leido */
rutasMensajes.patch('/:id/leido', asincrono(async (req, res) => {
  const resultado = await ejecutar('UPDATE `mensaje` SET `leido` = 1 WHERE `id_mensaje` = ?', [
    req.params.id,
  ]);
  res.json({ ok: true, actualizados: resultado.affectedRows });
}));
