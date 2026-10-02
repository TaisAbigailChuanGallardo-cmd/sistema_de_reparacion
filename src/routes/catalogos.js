import { Router } from 'express';
import { asincrono } from '../http/errores.js';
import { consultar } from '../db/pool.js';
import {
  CATEGORIA_MOVIMIENTO,
  CONCEPTO_SERVICIO,
  ESTADOS_ORDEN,
  METODO_PAGO,
  TIPO_COMPROBANTE,
  TIPO_DOCUMENTO,
  TIPO_EQUIPO,
} from '../domain/index.js';

/**
 * Catalogos de la aplicacion.
 *
 * Ambos endpoints viven en un unico Router montado una sola vez en /api/catalogos
 * (ver src/http/routes.js). Antes cada catalogo tenia su propio Router y ambos
 * se colgaban de '/catalogos'; con dos montajes sobre la misma ruta el segundo
 * quedaba al borde de que uno se comiera al otro, y registrar un Router con
 * api.get() en vez de api.use() hacia que la peticion cayera en noEncontrado
 * con un 404.
 *
 * GET /api/catalogos
 *   marcas, tipos de documento y de equipo, estados de la orden, proveedores y
 *   tecnicos. Es lo que necesitan los formularios de Clientes y Ordenes.
 *
 * GET /api/catalogos/inventario
 *   catalogos operativos del taller: conceptos de servicio, metodos de pago,
 *   tipos de comprobante y categorias de movimiento.
 *
 * Ninguno acepta parametros y ninguno muta datos, asi que se pueden cachear.
 */
export const rutasCatalogos = Router();

/** GET /api/catalogos */
rutasCatalogos.get('/', asincrono(async (_req, res) => {
  // Las tres consultas son cortas e independientes: resolverlas en paralelo
  // cuesta un solo viaje de ida y vuelta en vez de tres.
  const [marcas, proveedores, tecnicos] = await Promise.all([
    consultar('SELECT DISTINCT `marca` FROM `equipo` WHERE `marca` IS NOT NULL AND `marca` <> \'\' ORDER BY `marca`'),
    consultar('SELECT `id_proveedor`, `razon_social` FROM `proveedor` WHERE `activo` = 1 ORDER BY `razon_social`'),
    consultar('SELECT `id_tecnico`, `nombre` FROM `tecnico` WHERE `activo` = 1 ORDER BY `nombre`'),
  ]);

  res.json({
    ok: true,
    datos: {
      // Tipos y estados salen del dominio: son constantes, no hay tabla donde
      // consultarlos.
      tipo_documento: Object.values(TIPO_DOCUMENTO),
      tipo_equipo: Object.values(TIPO_EQUIPO),
      estados: ESTADOS_ORDEN,
      marcas: marcas.map((fila) => fila.marca),
      proveedores: proveedores.map((fila) => ({
        valor: fila.id_proveedor,
        texto: fila.razon_social,
      })),
      tecnicos: tecnicos.map((fila) => ({
        valor: fila.id_tecnico,
        texto: fila.nombre,
      })),
    },
  });
}));

/** GET /api/catalogos/inventario */
rutasCatalogos.get('/inventario', (_req, res) => {
  res.json({
    ok: true,
    datos: {
      concepto_servicio: Object.values(CONCEPTO_SERVICIO),
      metodo_pago: Object.values(METODO_PAGO),
      tipo_comprobante: Object.values(TIPO_COMPROBANTE),
      categoria_movimiento: Object.values(CATEGORIA_MOVIMIENTO),
    },
  });
});
