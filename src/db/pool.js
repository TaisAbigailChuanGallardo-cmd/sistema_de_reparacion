import 'dotenv/config';
import { AsyncLocalStorage } from 'node:async_hooks';
import mysql from 'mysql2/promise';
import { desdeErrorMysql } from '../domain/index.js';

/**
 * Pool de conexiones a MySQL.
 *
 * Se exporta como perezoso (lazy): el pool no se crea hasta la primera
 * consulta, de modo que los tests de dominio se puedan ejecutar sin base de
 * datos instalada.
 */
let pool;

/**
 * Conexion de la transaccion en curso, si la hay.
 *
 * Sin esto, enTransaccion() abre una conexion propia mientras los repositorios
 * siguen consultando sobre el pool: las escrituras quedarían fuera de la
 * transaccion y un rollback no las revertiría. Con este contexto, todo lo que
 * se ejecuta dentro del callback usa la misma conexion, sin que los
 * repositorios tengan que recibirla por parametro.
 */
const contextoTransaccion = new AsyncLocalStorage();

function crearPool() {
  return mysql.createPool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'taller_reparacion',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: ['DATE'],
    supportBigNumbers: true,
    decimalNumbers: true,
  });
}

/** Devuelve el pool, creandolo en la primera llamada. */
export function getPool() {
  if (!pool) pool = crearPool();
  return pool;
}

/** Conexion efectiva: la de la transaccion en curso, o la del pool. */
function executor() {
  return contextoTransaccion.getStore() ?? getPool();
}

/**
 * Ejecuta una consulta y devuelve las filas.
 * @param {string} sql
 * @param {Array}  parametros
 */
export async function consultar(sql, parametros = []) {
  try {
    const [filas] = await executor().execute(sql, parametros);
    return filas;
  } catch (error) {
    throw desdeErrorMysql(error);
  }
}

/**
 * Ejecuta una escritura y devuelve el encabezado del resultado
 * (insertId, affectedRows, changedRows).
 */
export async function ejecutar(sql, parametros = []) {
  try {
    const [resultado] = await executor().execute(sql, parametros);
    return resultado;
  } catch (error) {
    throw desdeErrorMysql(error);
  }
}

/**
 * Ejecuta varias operaciones dentro de una transaccion.
 * Si cualquiera falla, se revierte todo.
 * @param {(conexion: import('mysql2/promise').PoolConnection) => Promise<any>} tarea
 */
export async function enTransaccion(tarea) {
  const conexion = await getPool().getConnection();
  try {
    await conexion.beginTransaction();
    const resultado = await contextoTransaccion.run(conexion, () => tarea(conexion));
    await conexion.commit();
    return resultado;
  } catch (error) {
    await conexion.rollback();
    throw desdeErrorMysql(error);
  } finally {
    conexion.release();
  }
}

/** Comprueba que la base de datos responde. */
export async function verificarConexion() {
  const filas = await consultar('SELECT VERSION() AS version, DATABASE() AS base');
  return filas[0];
}

/** Cierra el pool. Lo usa el cierre ordenado del servidor. */
export async function cerrarPool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
