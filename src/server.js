import 'dotenv/config';
import { crearApp } from './app.js';
import { verificarConexion, cerrarPool } from './db/pool.js';

const PUERTO = Number(process.env.PORT ?? 3000);

const app = crearApp();

/**
 * Arranque del servidor.
 *
 * Se verifica la base de datos antes de aceptar trafico: si MySQL no responde
 * es preferible fallar aqui, con un mensaje claro, y no en la primera peticion
 * del usuario.
 */
async function iniciar() {
  try {
    const conexion = await verificarConexion();
    console.log(`Base de datos conectada: ${conexion.base} (MySQL ${conexion.version})`);
  } catch (error) {
    console.error('No se pudo conectar con la base de datos.');
    console.error(`  ${error.message}`);
    console.error('  Revise el archivo .env y ejecute: npm run db:setup');
    process.exit(1);
  }

  const servidor = app.listen(PUERTO, () => {
    console.log(`Sistema de gestion de reparacion escuchando en http://localhost:${PUERTO}`);
  });

  /** Cierre ordenado: primero se deja de aceptar conexiones, luego el pool. */
  const cerrar = async (senal) => {
    console.log(`\n${senal} recibido, cerrando el servidor...`);
    servidor.close(async () => {
      await cerrarPool();
      console.log('Servidor cerrado correctamente.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => cerrar('SIGINT'));
  process.on('SIGTERM', () => cerrar('SIGTERM'));
}

iniciar();
