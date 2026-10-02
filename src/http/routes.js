import { Router } from 'express';
import { autenticar as requiereSesion, login, logout, yo } from './autenticacion.js';
import { noEncontrado } from './errores.js';
import { verificarConexion } from '../db/pool.js';
import { asincrono } from './errores.js';
import { rutasCatalogos } from '../routes/catalogos.js';
import { rutasClientes, rutasEquipos } from '../routes/clientes.js';
import { rutasOrdenes } from '../routes/ordenes.js';
import { rutasInventario } from '../routes/inventario.js';
import { rutasReportes } from '../routes/reportes.js';
import {
  rutasEquipo,
  rutasMensajes,
  rutasPlanes,
  rutasUsuarios,
} from '../routes/personal.js';

/**
 * Ensamblado de la API REST.
 *
 * Convencion de respuestas:
 *   { ok: true,  datos: ... }   cuando la operacion fue exitosa
 *   { ok: false, error, regla } cuando fallo, con el codigo HTTPNx correspondiente
 *
 * Solo /api/auth/login y /api/salud son publicos; el resto exige token.
 */
const api = Router();

/** GET /api/salud — comprueba que el servidor y la base responden. */
api.get('/salud', asincrono(async (_req, res) => {
  try {
    const conexion = await verificarConexion();
    res.json({ ok: true, datos: { servidor: 'activo', base_de_datos: conexion } });
  } catch (error) {
    res.status(503).json({ ok: false, error: `La base de datos no responde: ${error.message}` });
  }
}));

api.post('/auth/login', asincrono(async (req, res) => login(req, res)));
api.get('/auth/yo', requiereSesion, yo);
api.post('/auth/logout', requiereSesion, logout);

// A partir de aqui, todo requiere sesion.
api.use(requiereSesion);

// Un solo Router con las dos rutas de catalogos, montado una unica vez.
// Conviene usar use() y no get(): un Router registrado como manejador no captura
// la peticion, cae en noEncontrado y el frontend recibe 404.
api.use('/catalogos', rutasCatalogos);

api.use('/clientes', rutasClientes);
api.use('/equipos', rutasEquipos);
api.use('/ordenes', rutasOrdenes);
api.use('/inventario', rutasInventario);
api.use('/tecnicos', rutasEquipo);
api.use('/usuarios', rutasUsuarios);
api.use('/planes', rutasPlanes);
api.use('/mensajes', rutasMensajes);
api.use('/reportes', rutasReportes);

api.use(noEncontrado);

export { api };
