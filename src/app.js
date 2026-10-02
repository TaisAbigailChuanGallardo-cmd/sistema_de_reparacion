import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { api } from './http/routes.js';
import { manejadorDeErrores } from './http/errores.js';
import { verificarConexion, cerrarPool } from './db/pool.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLICO = path.join(RAIZ, 'public');

/**
 * Aplicacion Express.
 *
 * Capas, en el orden en que una peticion las atraviesa:
 *   1. middlewares de infraestructura (registro, JSON, estaticos)
 *   2. /api  -> router de la API
 *   3. fallback a index.html (aplicacion de una sola pagina)
 *   4. manejador de errores
 */
export function crearApp() {
  const app = express();

  app.disable('x-powered-by');

  // Registro de peticiones. Se omite en produccion para no ralentizar.
  if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
      const inicio = Date.now();
      res.on('finish', () => {
        console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - inicio} ms)`);
      });
      next();
    });
  }

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Frontend estatico. index.html se sirve explicitamente para que la
  // navegacion a / abra la aplicacion.
  app.use(express.static(PUBLICO, { index: 'index.html' }));
  app.get('/', (_req, res) => res.sendFile(path.join(PUBLICO, 'index.html')));

  app.use('/api', api);

  // Cualquier otra ruta no-API devuelve la aplicacion: el enrutado del
  // frontend se hace en el navegador.
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(PUBLICO, 'index.html')));

  app.use(manejadorDeErrores);

  return app;
}
